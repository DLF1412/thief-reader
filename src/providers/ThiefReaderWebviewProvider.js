const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const AltKeyManager = require('../managers/AltKeyManager');
const StorageManager = require('../managers/StorageManager');
const ScrollWheelHandler = require('../handlers/ScrollWheelHandler');
const MouseEventListener = require('../handlers/MouseEventListener');
const FloatingWindowManager = require('../windows/FloatingWindowManager');
const StatusBarDisplay = require('../display/StatusBarDisplay');
const { getChapterContentAsString } = require('../utils/contentUtils');
const { parserFactory } = require('../parsers');
const { templateRenderer } = require('../templates');

/**
 * ThiefReader WebView 提供者类
 */
class ThiefReaderWebviewProvider {
	constructor(context) {
		this._context = context;
		this._files = [];
		this._currentFile = null;
		this._currentChapter = null;
		this._currentPage = 0;
		this._scrollOffset = 0;
		this._statusBarVisible = true;
		this._storageManager = new StorageManager(context);
		this._saveDebounceTimer = null;
		this._isRestoring = false;

		this._altKeyManager = new AltKeyManager();
		this._scrollHandler = new ScrollWheelHandler(this);
		this._floatingWindowManager = new FloatingWindowManager(context, this, this._scrollHandler);
		this._mouseEventListener = new MouseEventListener(this._altKeyManager, this._floatingWindowManager, this, this._scrollHandler);

		// 创建状态栏显示模块
		this._statusBarDisplay = new StatusBarDisplay(context);
		this._statusBarDisplay.init();

		this._pendingChapterTitle = null; // 保存待发送的章节标题

		this._restoreData();
	}

	/**
	 * 切换章节预览
	 */
	toggleChapterPreview() {
		this._floatingWindowManager.toggleChapterPreview();
	}

	/**
	 * 恢复数据 - 从存储中恢复文件列表和阅读状态
	 */
	async _restoreData() {
		try {
			this._isRestoring = true;

			// 加载保存的文件列表
			const savedFiles = await this._storageManager.loadFiles();

			// 第一次安装或没有保存的数据
			if (!savedFiles || savedFiles.length === 0) {
				this._statusBarDisplay.setText = "reader: 准备就绪";
				// 确保弹窗在首次启动时是关闭的
				if (this._floatingWindowManager.isVisible()) {
					this._floatingWindowManager.hide();
				}
				this._isRestoring = false;
				return;
			}

			// 有数据需要恢复时才显示恢复中的提示
			this._statusBarDisplay.setText = "reader: 正在恢复数据...";

			const restoredFiles = [];
			const failedFiles = [];

			// 遍历恢复每个文件
			for (const savedFile of savedFiles) {
				if (savedFile.type === '粘贴') {
					// 粘贴内容直接恢复
					// 使用 BaseParser 的静态方法提取章节
					const BaseParser = require('../parsers/BaseParser');
					const tempParser = new BaseParser();
					const chapters = tempParser.extractChaptersWithFallback(savedFile.fullText);
					restoredFiles.push({
						id: savedFile.id,
						name: savedFile.name,
						path: '',
						type: '粘贴',
						chapters: chapters,
						fullText: savedFile.fullText,
						pages: chapters.length,
						status: 'active',
						// 恢复阅读位置
						lastChapter: savedFile.lastChapter ?? null,
						lastScrollOffset: savedFile.lastScrollOffset ?? 0,
						lastReadTime: savedFile.lastReadTime ?? null,
						// 恢复章节位置映射
						chapterPositions: savedFile.chapterPositions || {}
					});
				} else {
					// 本地文件需要检查和重新加载
					if (!savedFile.path || !fs.existsSync(savedFile.path)) {
						// 文件不存在
						restoredFiles.push({
							id: savedFile.id,
							name: savedFile.name,
							path: savedFile.path,
							type: savedFile.type,
							chapters: [],
							fullText: '',
							pages: 0,
							status: 'missing',
							// 保留位置信息（虽然文件不存在）
							lastChapter: savedFile.lastChapter ?? null,
							lastScrollOffset: savedFile.lastScrollOffset ?? 0,
							lastReadTime: savedFile.lastReadTime ?? null,
							chapterPositions: savedFile.chapterPositions || {}
						});
						failedFiles.push({
							name: savedFile.name,
							reason: '文件不存在'
						});
					} else {
						// 文件存在，尝试重新加载
						try {
							const fileUri = vscode.Uri.file(savedFile.path);
							const fileInfo = await this._loadFileQuietly(fileUri, savedFile.id);
							if (fileInfo) {
								// 恢复阅读位置
								fileInfo.lastChapter = savedFile.lastChapter ?? null;
								fileInfo.lastScrollOffset = savedFile.lastScrollOffset ?? 0;
								fileInfo.lastReadTime = savedFile.lastReadTime ?? null;
								// 恢复章节位置映射
								fileInfo.chapterPositions = savedFile.chapterPositions || {};

								// 验证章节索引是否有效
								if (fileInfo.lastChapter !== null && fileInfo.lastChapter >= fileInfo.chapters.length) {
									fileInfo.lastChapter = 0;
									fileInfo.lastScrollOffset = 0;
								}

								restoredFiles.push(fileInfo);
							}
						} catch (error) {
							// 解析失败
							restoredFiles.push({
								id: savedFile.id,
								name: savedFile.name,
								path: savedFile.path,
								type: savedFile.type,
								chapters: [],
								fullText: '',
								pages: 0,
								status: 'error',
								// 保留位置信息
								lastChapter: savedFile.lastChapter ?? null,
								lastScrollOffset: savedFile.lastScrollOffset ?? 0,
								lastReadTime: savedFile.lastReadTime ?? null,
								chapterPositions: savedFile.chapterPositions || {}
							});
							failedFiles.push({
								name: savedFile.name,
								reason: '文件解析失败: ' + error.message
							});
						}
					}
				}
			}

			// 更新文件列表
			this._files = restoredFiles;

			// 显示恢复结果（只在有文件时显示）
			if (restoredFiles.length > 0) {
				if (failedFiles.length > 0) {
					const message = `恢复了 ${restoredFiles.length} 个文件，其中 ${failedFiles.length} 个加载失败`;
					vscode.window.showWarningMessage(message, '查看详情', '清理失效文件').then(selection => {
						if (selection === '查看详情') {
							const details = failedFiles.map(f => `• ${f.name}: ${f.reason}`).join('\n');
							vscode.window.showInformationMessage(details);
						} else if (selection === '清理失效文件') {
							this._cleanupMissingFiles();
						}
					});
				} else {
					vscode.window.showInformationMessage(`成功恢复 ${restoredFiles.length} 个文件`);
				}
			}

			// 恢复阅读位置
			await this._restoreReadingState();

			// 刷新界面
			if (this._view) {
				this._refreshView();
			}

			// 确保弹窗在启动时是关闭的
			if (this._floatingWindowManager.isVisible()) {
				this._floatingWindowManager.hide();
			}

			this._isRestoring = false;
		} catch (error) {
			console.error('恢复数据失败:', error);
			vscode.window.showErrorMessage('恢复阅读数据失败: ' + error.message);
			this._statusBarDisplay.setText = "reader: 准备就绪";
			// 确保弹窗在出错时也是关闭的
			if (this._floatingWindowManager.isVisible()) {
				this._floatingWindowManager.hide();
			}
			this._isRestoring = false;
		}
	}

	/**
	 * 恢复阅读状态
	 */
	async _restoreReadingState() {
		try {
			const state = await this._storageManager.loadReadingState();

			if (!state || !state.currentFileId) {
				this._statusBarDisplay.setText = "reader: 准备就绪";
				return;
			}

			// 查找文件
			const file = this._files.find(f => f.id === state.currentFileId);

			if (!file) {
				// 文件已被删除
				this._statusBarDisplay.setText = "reader: 准备就绪";
				return;
			}

			if (file.status === 'missing' || file.status === 'error') {
				// 文件不可用
				vscode.window.showWarningMessage(
					`上次阅读的文件 "${file.name}" 无法加载，请重新选择文件`
				);
				this._statusBarDisplay.setText = "reader: 准备就绪";
				return;
			}

			// 恢复选择
			this._currentFile = file;

			// 使用文件自己保存的阅读位置
			this._restoreFileReadingPosition(file);

			// 显示内容
			if (this._currentChapter !== null && file.chapters && file.chapters.length > 0) {
				const chapter = file.chapters[this._currentChapter];
				this._displayChapterText(chapter);
				// 发送正文内容长度到 WebView
				this._sendContentLengthToView(chapter.title);
			} else {
				this._statusBarDisplay.setText = `reader: 已恢复 ${file.name}`;
			}

			// 确保弹窗在恢复后是关闭的
			if (this._floatingWindowManager.isVisible()) {
				this._floatingWindowManager.hide();
			}
		} catch (error) {
			console.error('恢复阅读状态失败:', error);
			this._statusBarDisplay.setText = "reader: 准备就绪";
			// 确保弹窗在出错时也是关闭的
			if (this._floatingWindowManager.isVisible()) {
				this._floatingWindowManager.hide();
			}
		}
	}

	/**
	 * 静默加载文件（用于恢复数据）
	 */
	async _loadFileQuietly(fileUri, fileId) {
		const filePath = fileUri.fsPath;
		const fileName = path.basename(filePath);
		const fileExtension = path.extname(filePath).toLowerCase();

		// 使用解析器工厂解析文件
		const result = await parserFactory.parse(filePath);

		// 获取文件类型
		const fileType = fileExtension === '.pdf' ? 'PDF' : fileExtension === '.txt' ? 'TXT' : 'EPUB';

		return {
			id: fileId || Date.now().toString(),
			name: fileName,
			path: filePath,
			type: fileType,
			chapters: result.chapters,
			fullText: result.content,
			pages: result.pageCount,
			status: 'active'
		};
	}

	/**
	 * 清理缺失和错误的文件
	 */
	_cleanupMissingFiles() {
		const validFiles = this._files.filter(
			f => f.status !== 'missing' && f.status !== 'error'
		);

		const removedCount = this._files.length - validFiles.length;
		this._files = validFiles;

		// 如果当前文件被清理了，清空选择
		if (this._currentFile && (this._currentFile.status === 'missing' || this._currentFile.status === 'error')) {
			this._currentFile = null;
			this._currentChapter = null;
			this._scrollOffset = 0;
			this._statusBarDisplay.setText = "reader: 准备就绪";
		}

		this._saveCurrentState();
		this._refreshView();

		vscode.window.showInformationMessage(`已清理 ${removedCount} 个失效文件`);
	}

	/**
	 * 格式化时间戳
	 * @param {number} timestamp - 时间戳
	 * @returns {string} - 格式化后的时间字符串 YYYY-MM-DD HH:mm:ss
	 */
	_formatTimestamp(timestamp) {
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');

		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
	}

	/**
	 * 为粘贴内容生成友好的文件名
	 * @param {string} content - 粘贴的文本内容
	 * @returns {string} - 格式化的文件名
	 */
	_generatePasteFileName(content) {
		// 1. 清理文本（去除多余空白和换行）
		const cleanContent = content.trim().replace(/\s+/g, ' ');

		// 2. 提取前10个字符
		const preview = cleanContent.substring(0, 10);

		// 3. 生成时间戳
		const timestamp = Date.now();
		const formattedTime = this._formatTimestamp(timestamp);

		// 4. 组合文件名
		if (preview.length === 0) {
			return `[粘贴内容]（空）（${formattedTime}）`;
		} else if (cleanContent.length > 10) {
			return `[粘贴内容]${preview}...（${formattedTime}）`;
		} else {
			return `[粘贴内容]${preview}（${formattedTime}）`;
		}
	}

	/**
	 * 保存文件的阅读位置
	 */
	_saveFileReadingPosition(fileId) {
		if (!fileId) return;

		const file = this._files.find(f => f.id === fileId);
		if (!file) return;

		// 更新文件的阅读位置
		file.lastChapter = this._currentChapter;
		file.lastScrollOffset = this._scrollOffset;
		file.lastReadTime = Date.now();
	}

	/**
	 * 保存当前章节的滚动位置
	 */
	_saveChapterPosition(chapterIndex, scrollOffset) {
		if (!this._currentFile || chapterIndex === null || chapterIndex === undefined) return;

		// 初始化 chapterPositions（如果不存在）
		if (!this._currentFile.chapterPositions) {
			this._currentFile.chapterPositions = {};
		}

		// 保存章节位置
		this._currentFile.chapterPositions[chapterIndex] = scrollOffset;
	}

	/**
	 * 获取章节的保存位置
	 */
	_getChapterPosition(chapterIndex) {
		if (!this._currentFile || chapterIndex === null || chapterIndex === undefined) {
			return 0;
		}

		// 如果没有 chapterPositions 或该章节没有保存位置，返回0
		if (!this._currentFile.chapterPositions) {
			return 0;
		}

		return this._currentFile.chapterPositions[chapterIndex] ?? 0;
	}

	/**
	 * 恢复文件的阅读位置
	 */
	_restoreFileReadingPosition(file) {
		if (!file) return;

		// 检查文件是否有保存的位置
		if (file.lastChapter !== null && file.lastChapter !== undefined) {
			// 验证章节索引是否有效
			if (file.chapters && file.lastChapter >= file.chapters.length) {
				// 章节越界，重置到第一章
				this._currentChapter = file.chapters.length > 0 ? 0 : null;
				this._scrollOffset = 0;
				vscode.window.showWarningMessage(
					`文件 "${file.name}" 的阅读位置已失效，已重置到开头`
				);
			} else {
				// 正常恢复
				this._currentChapter = file.lastChapter;
				this._scrollOffset = file.lastScrollOffset || 0;
			}
		} else {
			// 首次打开，从头开始
			this._currentChapter = file.chapters && file.chapters.length > 0 ? 0 : null;
			this._scrollOffset = 0;
		}
	}

	/**
	 * 保存当前状态（带防抖）
	 */
	_saveCurrentState() {
		// 如果正在恢复数据，不保存
		if (this._isRestoring) {
			return;
		}

		// 更新当前文件的阅读位置
		if (this._currentFile) {
			this._saveFileReadingPosition(this._currentFile.id);
		}

		// 清除之前的定时器
		if (this._saveDebounceTimer) {
			clearTimeout(this._saveDebounceTimer);
		}

		// 设置新的定时器（500ms 后保存）
		this._saveDebounceTimer = setTimeout(async () => {
			try {
				// 保存文件列表（包含每个文件的阅读位置）
				await this._storageManager.saveFiles(this._files);

				// 保存当前选中的文件ID
				if (this._currentFile) {
					await this._storageManager.saveReadingState({
						currentFileId: this._currentFile.id
					});
				}
			} catch (error) {
				console.error('保存状态失败:', error);
			}
		}, 500);
	}

	/**
	 * 解析 WebView 视图
	 * @param {vscode.WebviewView} webviewView
	 */
	resolveWebviewView(webviewView) {
		this._view = webviewView;

		// 配置 WebView 选项
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._context.extensionUri]
		};

		// 设置 WebView 的 HTML 内容
		webviewView.webview.html = this._getHtmlContent();

		// 如果有待发送的章节标题，发送正文内容长度
		if (this._pendingChapterTitle) {
			console.log('WebView 就绪，发送待发送的章节标题');
			this._sendContentLengthToView(this._pendingChapterTitle);
			this._pendingChapterTitle = null;
		}

		// 监听来自 WebView 的消息
		webviewView.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'selectPdf':
						await this._selectFile();
						break;
					case 'selectFile':
						await this._selectFileFromList(message.fileId);
						break;
					case 'selectChapter':
						await this._selectChapter(message.chapterId);
						break;
					case 'removeFile':
						this._removeFile(message.fileId);
						break;
					case 'loadPastedContent':
						await this._loadPastedContent(message.content);
						break;
				case 'setOpacity':
					this._setOpacity(message.value);
					break;
				case 'getOpacity':
					this._sendOpacityToView();
					break;
				case 'cleanupMissingFiles':
					this._cleanupMissingFiles();
					break;
				case 'getDisplaySettings':
					this._sendDisplaySettingsToView();
					break;
				case 'setDisplayWidth':
					this._setDisplayWidth(message.value);
					break;
				case 'setScrollStep':
					this._setScrollStep(message.value);
					break;
				}
			},
			undefined,
			this._context.subscriptions
		);

		// 注册键盘快捷键
		this._registerKeyBindings();
	}

	/**
	 * 获取 WebView 的 HTML 内容
	 */
	_getHtmlContent() {
		const fileListHtml = this._files.map(file => {
			let statusIcon = '';
			let statusText = '';
			const isDisabled = file.status === 'missing' || file.status === 'error';

			if (file.status === 'missing') {
				statusIcon = '⚠️ ';
				statusText = ' <span style="color: var(--vscode-errorForeground);">(文件不存在)</span>';
			} else if (file.status === 'error') {
				statusIcon = '⚠️ ';
				statusText = ' <span style="color: var(--vscode-errorForeground);">(解析失败)</span>';
			}

			return `
				<div class="file-item ${this._currentFile && this._currentFile.id === file.id ? 'active' : ''} ${isDisabled ? 'disabled' : ''}"
				     data-file-id="${file.id}"
				     onclick="${isDisabled ? '' : `selectFile('${file.id}')`}"
				     style="display: flex; align-items: center; justify-content: space-between;">
					<div class="file-name">${statusIcon}${file.name} <span style="color: var(--vscode-descriptionForeground); font-size: 10px;">[${file.type}]${statusText}</span></div>
					<div class="file-actions">
						<button class="btn-remove" onclick="event.stopPropagation(); removeFile('${file.id}')">删除</button>
					</div>
				</div>
			`;
		}).join('');

		const chapterListHtml = this._currentFile && this._currentFile.chapters ?
			this._currentFile.chapters.map((chapter, index) => `
				<div class="chapter-item ${this._currentChapter === index ? 'active' : ''}" data-chapter-id="${index}">
					<div class="chapter-title" onclick="selectChapter(${index})">${chapter.title}</div>
				</div>
			`).join('') : '';

		// 计算当前章节正文显示长度
		let contentLength = 0;
		if (this._currentChapter !== null && this._currentFile && this._currentFile.chapters) {
			const chapter = this._currentFile.chapters[this._currentChapter];
			if (chapter) {
				contentLength = this._statusBarDisplay.calculateContentLength(chapter.title);
			}
		}

		// 使用模板渲染器渲染 HTML
		return templateRenderer.render('main-view', {
			fileListHtml: fileListHtml || '<div class="empty-state">暂无文件，请点击上方按钮选择PDF、TXT或EPUB文件</div>',
			chapterListHtml: chapterListHtml || '<div class="empty-state">请先选择一个文件或粘贴文本内容</div>',
			contentLength: contentLength
		});
	}

	/**
	 * 选择文件（支持PDF、TXT和EPUB）
	 */
	async _selectFile() {
		try {
			const options = {
				canSelectMany: false,
				openLabel: '选择文件',
				filters: {
					'支持的文件': ['pdf', 'txt', 'epub'],
					'PDF文件': ['pdf'],
					'文本文件': ['txt'],
					'EPUB电子书': ['epub'],
					'所有文件': ['*']
				}
			};

			const fileUri = await vscode.window.showOpenDialog(options);
			if (fileUri && fileUri[0]) {
				await this._loadFile(fileUri[0]);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`选择文件失败: ${error.message}`);
		}
	}

	/**
	 * 加载文件（支持PDF、TXT和EPUB）
	 */
	async _loadFile(fileUri) {
		try {
			const filePath = fileUri.fsPath;
			const fileName = path.basename(filePath);
			const fileExtension = path.extname(filePath).toLowerCase();

			this._statusBarDisplay.setText = `reader: 正在解析 ${fileName}...`;

			// 使用解析器工厂解析文件
			const result = await parserFactory.parse(filePath);

			// 获取文件类型
			const fileType = fileExtension === '.pdf' ? 'PDF' : fileExtension === '.txt' ? 'TXT' : 'EPUB';

			const fileInfo = {
				id: Date.now().toString(),
				name: fileName,
				path: filePath,
				type: fileType,
				chapters: result.chapters,
				fullText: result.content,
				pages: result.pageCount,
				status: 'active',
				// 初始化阅读位置
				lastChapter: null,
				lastScrollOffset: 0,
				lastReadTime: null,
				// 初始化章节位置映射
				chapterPositions: {}
			};

			// 检查是否已存在相同路径的文件（按路径检查，不是文件名）
			const existingIndex = this._files.findIndex(f => f.path === filePath);
			if (existingIndex !== -1) {
				// 找到相同路径的文件，询问用户是否重新加载
				const oldFile = this._files[existingIndex];
				const selection = await vscode.window.showInformationMessage(
					`文件 "${fileName}" 已存在，是否重新加载？`,
					{ modal: false },
					'重新加载',
					'取消'
				);

				if (selection === '重新加载') {
					// 用户选择重新加载，保留旧的阅读位置和ID
					fileInfo.id = oldFile.id; // 保留原ID
					fileInfo.lastChapter = oldFile.lastChapter;
					fileInfo.lastScrollOffset = oldFile.lastScrollOffset;
					fileInfo.lastReadTime = oldFile.lastReadTime;
					fileInfo.chapterPositions = oldFile.chapterPositions || {};

					// 验证章节索引是否仍然有效
					if (fileInfo.lastChapter !== null && fileInfo.lastChapter >= fileInfo.chapters.length) {
						fileInfo.lastChapter = 0;
						fileInfo.lastScrollOffset = 0;
						vscode.window.showInformationMessage(
							`文件内容已变化，阅读位置已重置到开头`
						);
					}

					this._files[existingIndex] = fileInfo;
					this._statusBarDisplay.setText = `reader: 已重新加载 ${fileName}`;
					vscode.window.showInformationMessage(`成功重新加载${fileInfo.type}文件: ${fileName}`);
				} else {
					// 用户取消，不做任何操作
					this._statusBarDisplay.setText = `reader: 取消加载`;
					return;
				}
			} else {
				// 新文件，直接添加
				this._files.push(fileInfo);
				this._statusBarDisplay.setText = `reader: 已加载 ${fileName}`;
				vscode.window.showInformationMessage(`成功加载${fileInfo.type}文件: ${fileName}`);
			}

			// 保存状态
			this._saveCurrentState();

			// 刷新界面
			this._refreshView();
		} catch (error) {
			this._statusBarDisplay.setText = "reader: 加载失败";
			vscode.window.showErrorMessage(`加载文件失败: ${error.message}`);
		}
	}

	/**
	 * 加载粘贴的文本内容
	 */
	async _loadPastedContent(content) {
		try {
			this._statusBarDisplay.setText = "reader: 正在解析粘贴内容...";

			// 使用 BaseParser 的静态方法提取章节
			const BaseParser = require('../parsers/BaseParser');
			const tempParser = new BaseParser();
			const chapters = tempParser.extractChaptersWithFallback(content);

			// 生成友好的文件名
			const fileName = this._generatePasteFileName(content);
			const fileInfo = {
				id: Date.now().toString(),
				name: fileName,
				path: '',
				type: '粘贴',
				chapters: chapters,
				fullText: content,
				pages: chapters.length,
				status: 'active',
				// 初始化阅读位置
				lastChapter: null,
				lastScrollOffset: 0,
				lastReadTime: null,
				// 初始化章节位置映射
				chapterPositions: {}
			};

			// 添加到文件列表
			this._files.push(fileInfo);

			// 自动选中这个文件
			this._currentFile = fileInfo;
			this._currentChapter = chapters.length > 0 ? 0 : null;
			this._currentPage = 0;
			this._scrollOffset = 0;

			this._statusBarDisplay.setText = `reader: 已加载粘贴内容`;
			vscode.window.showInformationMessage(`成功加载粘贴内容，共${chapters.length}个章节`);

			// 保存状态
			this._saveCurrentState();

			// 刷新界面
			this._refreshView();
		} catch (error) {
			this._statusBarDisplay.setText = "reader: 加载失败";
			vscode.window.showErrorMessage(`加载粘贴内容失败: ${error.message}`);
		}
	}

	/**
	 * 从列表中选择文件
	 */
	async _selectFileFromList(fileId) {
		const file = this._files.find(f => f.id === fileId);
		if (!file) return;

		// 检查文件状态
		if (file.status === 'missing') {
			vscode.window.showWarningMessage(
				`文件 "${file.name}" 已不存在，无法打开`
			);
			return;
		}

		if (file.status === 'error') {
			vscode.window.showWarningMessage(
				`文件 "${file.name}" 解析失败，无法打开`
			);
			return;
		}

		// 步骤1：保存当前文件的阅读位置
		if (this._currentFile && this._currentFile.id !== fileId) {
			this._saveFileReadingPosition(this._currentFile.id);
		}

		// 步骤2：切换到新文件
		this._currentFile = file;

		// 步骤3：恢复新文件的阅读位置
		this._restoreFileReadingPosition(file);

		// 步骤4：显示内容
		if (this._currentChapter !== null && file.chapters && file.chapters.length > 0) {
			const chapter = file.chapters[this._currentChapter];
			this._displayChapterText(chapter);
			// 发送正文内容长度到 WebView
			this._sendContentLengthToView(chapter.title);
			// _displayChapterText 已经设置了完整的状态栏文本（包括章节标题、滚动位置、具体文字）

			// 步骤5：切换文件时自动隐藏章节预览弹窗（在更新显示后）
			if (this._floatingWindowManager.isVisible()) {
				this._floatingWindowManager.hide();
				// 隐藏弹窗后立即刷新状态栏，确保图标正确更新为📖
				setTimeout(() => {
					this._displayChapterText(chapter);
				}, 50);
			}
		} else {
			this._statusBarDisplay.setText = `reader: 已选择 ${file.name} [${file.type}]`;

			// 如果没有章节内容，也要隐藏弹窗
			if (this._floatingWindowManager.isVisible()) {
				this._floatingWindowManager.hide();
			}
		}

		// 步骤6：保存状态并刷新界面
		this._saveCurrentState();
		this._refreshView();
	}

	/**
	 * 选择章节
	 */
	async _selectChapter(chapterId) {
		if (!this._currentFile || !this._currentFile.chapters) return;

		const chapterIndex = parseInt(chapterId);
		if (chapterIndex >= 0 && chapterIndex < this._currentFile.chapters.length) {
			// 步骤1：保存当前章节的滚动位置
			if (this._currentChapter !== null && this._currentChapter !== chapterIndex) {
				this._saveChapterPosition(this._currentChapter, this._scrollOffset);
			}

			// 步骤2：切换到新章节
			this._currentChapter = chapterIndex;
			this._currentPage = 0;

			// 步骤3：恢复新章节的滚动位置
			this._scrollOffset = this._getChapterPosition(chapterIndex);

			// 步骤4：根据章节标题自动调整滑动步长
			const chapter = this._currentFile.chapters[chapterIndex];
			this._statusBarDisplay.autoAdjustScrollStep(chapter.title);

			// 步骤5：发送更新后的滑动步长到 WebView 设置面板
			this._sendDisplaySettingsToView();

			// 步骤6：发送正文内容长度到 WebView 设置面板
			this._sendContentLengthToView(chapter.title);

			// 步骤7：显示内容
			this._displayChapterText(chapter);
			this._saveCurrentState();

			// 步骤8：切换章节时自动隐藏章节预览弹窗（在更新显示后）
			if (this._floatingWindowManager.isVisible()) {
				this._floatingWindowManager.hide();
				// 隐藏弹窗后立即刷新状态栏，确保图标正确更新为📖
				setTimeout(() => {
					this._displayChapterText(chapter);
				}, 50);
			}

			// 通过消息更新章节高亮，而不是刷新整个视图（避免滚动位置重置）
			this._updateChapterHighlight(chapterIndex);
		}
	}

	/**
	 * 更新章节高亮（通过消息机制，不刷新整个视图）
	 */
	_updateChapterHighlight(chapterIndex) {
		if (this._view) {
			this._view.webview.postMessage({
				command: 'updateChapterHighlight',
				chapterIndex: chapterIndex
			});
		}
	}

	/**
	 * 显示章节文字 - 适配器方法，调用 StatusBarDisplay 模块
	 */
	_displayChapterText(chapter) {
		if (!chapter || !chapter.content) return;

		// 如果状态栏文字被隐藏，不更新内容
		if (!this._statusBarVisible) {
			return;
		}

		// 获取完整章节内容
		const fullContent = chapter.content.join(' ');

		// 通过状态栏显示模块更新
		this._statusBarDisplay.updateDisplay({
			chapterTitle: chapter.title,
			scrollOffset: this._scrollOffset,
			content: fullContent,
			totalLength: fullContent.length
		});
	}

	/**
	 * 删除文件
	 */
	_removeFile(fileId) {
		const index = this._files.findIndex(f => f.id === fileId);
		if (index !== -1) {
			const file = this._files[index];
			const fileName = file.name;
			const fileType = file.type;
			this._files.splice(index, 1);

			// 如果删除的是当前选中的文件，清空选择
			if (this._currentFile && this._currentFile.id === fileId) {
				this._currentFile = null;
				this._currentChapter = null;
				this._currentPage = 0;
				this._scrollOffset = 0;
				this._statusBarDisplay.setText = "reader: 准备就绪";
			}

			vscode.window.showInformationMessage(`已删除${fileType}文件: ${fileName}`);
			this._saveCurrentState();
			this._refreshView();
		}
	}

	/**
	 * 注册键盘快捷键
	 */
	_registerKeyBindings() {
		// 注册翻页命令 (Alt + Shift + 左右方向键)
		const previousPageCommand = vscode.commands.registerCommand('thief-reader.previousPage', () => {
			this._previousPage();
		});

		const nextPageCommand = vscode.commands.registerCommand('thief-reader.nextPage', () => {
			this._nextPage();
		});

		// 注册滑动命令 (Alt + 左右方向键)
		const scrollLeftCommand = vscode.commands.registerCommand('thief-reader.scrollLeft', () => {
			this._scrollLeft();
		});

		const scrollRightCommand = vscode.commands.registerCommand('thief-reader.scrollRight', () => {
			this._scrollRight();
		});

		// 注册切换显示命令 (Shift + 空格键)
		const toggleVisibilityCommand = vscode.commands.registerCommand('thief-reader.toggleVisibility', () => {
			this._toggleStatusBarVisibility();
		});

		// 注册切换状态栏内容显示/隐藏命令 (Alt + 空格键)
		const toggleStatusBarContentCommand = vscode.commands.registerCommand('thief-reader.toggleStatusBarContent', () => {
			this._toggleStatusBarContent();
		});

		this._context.subscriptions.push(
			previousPageCommand,
			nextPageCommand,
			scrollLeftCommand,
			scrollRightCommand,
			toggleVisibilityCommand,
			toggleStatusBarContentCommand
		);
	}

	/**
	 * 上一页 (Alt + Shift + 左方向键) - 快速向前跳转显示宽度个字符
	 */
	_previousPage() {
		if (this._currentChapter !== null && this._currentFile) {
			const jumpSize = this._statusBarDisplay.getDisplayWidth(); // 从配置读取显示宽度

			if (this._scrollOffset > 0) {
				this._scrollOffset = Math.max(0, this._scrollOffset - jumpSize);
				const chapter = this._currentFile.chapters[this._currentChapter];
				this._displayChapterText(chapter);
				// 保存当前章节位置
				this._saveChapterPosition(this._currentChapter, this._scrollOffset);
				this._saveCurrentState();
			}
		}
	}

	/**
	 * 下一页 (Alt + Shift + 右方向键) - 快速向后跳转显示宽度个字符
	 */
	_nextPage() {
		if (this._currentChapter !== null && this._currentFile) {
			const chapter = this._currentFile.chapters[this._currentChapter];
			const fullContent = chapter.content.join(' ');
			const jumpSize = this._statusBarDisplay.getDisplayWidth(); // 从配置读取显示宽度
			const maxScrollOffset = Math.max(0, fullContent.length - 1);

			if (this._scrollOffset < maxScrollOffset) {
				this._scrollOffset = Math.min(maxScrollOffset, this._scrollOffset + jumpSize);
				this._displayChapterText(chapter);
				// 保存当前章节位置
				this._saveChapterPosition(this._currentChapter, this._scrollOffset);
				this._saveCurrentState();
			}
		}
	}

	/**
	 * 向左滑动 (Alt + 左方向键) - 在整个章节中向左滑动
	 * 如果滑动到章节开头，自动切换到上一章
	 */
	_scrollLeft() {
		if (this._currentChapter !== null && this._currentFile) {
			const scrollStep = this._statusBarDisplay.getScrollStep(); // 从配置读取滑动步长

			if (this._scrollOffset > 0) {
				this._scrollOffset = Math.max(0, this._scrollOffset - scrollStep);
				const chapter = this._currentFile.chapters[this._currentChapter];
				this._displayChapterText(chapter);
				// 保存当前章节位置
				this._saveChapterPosition(this._currentChapter, this._scrollOffset);
				this._saveCurrentState();
			} else if (this._currentChapter > 0) {
				// 滑动到章节开头，切换到上一章
				// 计算上一章的显示位置：显示最后的余数内容
				const prevChapterIndex = this._currentChapter - 1;
				const prevChapter = this._currentFile.chapters[prevChapterIndex];
				const prevContent = prevChapter.content.join(' ');
				const displayLength = this._statusBarDisplay.getDisplayWidth();

				// 计算标题部分长度（用于计算正文显示长度）
				const maxTitlePartLength = 25;
				let displayTitle = prevChapter.title || '';
				const maxTitleLength = maxTitlePartLength - 7 - 1; // 7=进度条, 1=图标
				if (displayTitle.length > maxTitleLength) {
					displayTitle = displayTitle.substring(0, maxTitleLength - 1) + '…';
				}
				const progressStr = `[${'0'.padStart(5, '0')}%]`;
				const titlePartLength = displayTitle.length + progressStr.length;
				const contentDisplayLength = displayLength - titlePartLength;

				// 计算上一章的滚动位置：显示最后的余数内容
				const remainder = prevContent.length % contentDisplayLength;
				const scrollOffset = remainder > 0 ? prevContent.length - remainder : Math.max(0, prevContent.length - contentDisplayLength);

				// 调用 _selectChapter 切换章节并设置位置
				this._currentChapter = prevChapterIndex;
				this._scrollOffset = scrollOffset;
				this._saveChapterPosition(prevChapterIndex, scrollOffset);

				// 根据新章节标题自动调整滑动步长
				this._statusBarDisplay.autoAdjustScrollStep(prevChapter.title);
				this._sendDisplaySettingsToView();
				this._sendContentLengthToView(prevChapter.title);

				const chapter = this._currentFile.chapters[this._currentChapter];
				this._displayChapterText(chapter);
				this._saveCurrentState();
				this._updateChapterHighlight(prevChapterIndex);
			}
		}
	}

	/**
	 * 向右滑动 (Alt + 右方向键) - 在整个章节中向右滑动
	 * 如果滑动到章节末尾，自动切换到下一章
	 */
	_scrollRight() {
		if (this._currentChapter !== null && this._currentFile) {
			const scrollStep = this._statusBarDisplay.getScrollStep(); // 从配置读取滑动步长
			const chapter = this._currentFile.chapters[this._currentChapter];
			const fullContent = chapter.content.join(' ');
			const maxScrollOffset = Math.max(0, fullContent.length - 1);

			if (this._scrollOffset < maxScrollOffset) {
				this._scrollOffset = Math.min(maxScrollOffset, this._scrollOffset + scrollStep);
				this._displayChapterText(chapter);
				// 保存当前章节位置
				this._saveChapterPosition(this._currentChapter, this._scrollOffset);
				this._saveCurrentState();
			} else if (this._currentChapter < this._currentFile.chapters.length - 1) {
				// 滑动到章节末尾，切换到下一章
				this._selectChapter(this._currentChapter + 1);
			}
		}
	}

	/**
	 * 切换状态栏文字的显示/隐藏 (Shift + 空格键)
	 */
	_toggleStatusBarVisibility() {
		// 新功能：切换章节预览显示
		this.toggleChapterPreview();
	}

	/**
	 * 切换状态栏内容显示/隐藏 (Alt + 空格键)
	 * 通过修改透明度实现：隐藏时透明度为0，显示时恢复原透明度
	 */
	_toggleStatusBarContent() {
		// 通过状态栏显示模块切换内容显示/隐藏
		this._statusBarDisplay.toggleContentVisibility();

		// 如果当前有内容显示，立即更新状态栏
		if (this._currentChapter !== null && this._currentFile) {
			const chapter = this._currentFile.chapters[this._currentChapter];
			this._displayChapterText(chapter);
		}
	}

	/**
	 * 设置透明度
	 * @param {number} value - 透明度值 (5-100)
	 */
	_setOpacity(value) {
		// 通过状态栏显示模块设置透明度
		this._statusBarDisplay.setOpacity(value);

		// 如果当前有内容显示，立即更新
		if (this._currentChapter !== null && this._currentFile) {
			const chapter = this._currentFile.chapters[this._currentChapter];
			this._displayChapterText(chapter);
		}
	}

	/**
	 * 发送当前透明度值到WebView
	 */
	_sendOpacityToView() {
		if (this._view) {
			this._view.webview.postMessage({
				command: 'setOpacity',
				value: this._statusBarDisplay.getOpacity()
			});
		}
	}

	/**
	 * 设置显示宽度
	 * @param {number} value - 显示宽度值 (30-100)
	 */
	_setDisplayWidth(value) {
		this._statusBarDisplay.setDisplayWidth(value);

		// 如果当前有内容显示，根据当前章节标题自动调整滑动步长
		if (this._currentChapter !== null && this._currentFile) {
			const chapter = this._currentFile.chapters[this._currentChapter];
			this._statusBarDisplay.autoAdjustScrollStep(chapter.title);

			// 发送更新后的滑动步长到 WebView 设置面板
			this._sendDisplaySettingsToView();

			// 发送更新后的正文长度到 WebView 设置面板
			this._sendContentLengthToView(chapter.title);

			// 更新状态栏显示
			this._displayChapterText(chapter);
		}
	}

	/**
	 * 设置滑动步长
	 * @param {number} value - 滑动步长值 (1-90)
	 */
	_setScrollStep(value) {
		this._statusBarDisplay.setScrollStep(value);
	}

	/**
	 * 发送显示设置到WebView
	 */
	_sendDisplaySettingsToView() {
		if (this._view) {
			this._view.webview.postMessage({
				command: 'setDisplaySettings',
				displayWidth: this._statusBarDisplay.getDisplayWidth(),
				scrollStep: this._statusBarDisplay.getScrollStep()
			});
		}
	}

	/**
	 * 发送正文内容长度到WebView
	 * @param {string} chapterTitle - 章节标题
	 */
	_sendContentLengthToView(chapterTitle) {
		const contentLength = this._statusBarDisplay.calculateContentLength(chapterTitle);
		console.log(`发送正文长度到 WebView: ${contentLength} (标题: ${chapterTitle})`);

		if (this._view) {
			this._view.webview.postMessage({
				command: 'updateContentLength',
				contentLength: contentLength
			});
		} else {
			// 保存章节标题，等 view 准备好后再发送
			console.log('WebView 未就绪，保存章节标题到 pending');
			this._pendingChapterTitle = chapterTitle;
		}
	}

	/**
	 * 刷新视图
	 */
	_refreshView() {
		if (this._view) {
			this._view.webview.html = this._getHtmlContent();
		}
	}
}

module.exports = ThiefReaderWebviewProvider;
