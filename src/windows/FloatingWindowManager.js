const vscode = require('vscode');
const { getChapterContentAsString } = require('../utils/contentUtils');
const { generateChapterPreviewHtml } = require('../utils/htmlTemplates');

/**
 * 悬浮窗管理器类 - 管理Alt+悬停时的悬浮预览窗口
 */
class FloatingWindowManager {
	constructor(context, readerProvider, scrollHandler) {
		this._context = context;
		this._readerProvider = readerProvider;
		this._scrollHandler = scrollHandler;
		this._webviewPanel = null;
		this._isVisible = false;
		this._currentContent = null;
		this._debounceTimer = null;
		// 添加滚动位置记录
		this._lastScrollTop = 0;
		this._lastScrollPercentage = 0;
		this._lastCharOffset = 0; // 添加字符偏移量记录
		this._popupTextOpacity = 100; // 弹窗文字透明度，默认100%
		this._loadPopupOpacity(); // 从配置中加载透明度
	}

	/**
	 * 显示完整章节预览
	 */
	async showChapterPreview() {
		try {
			const currentFile = this._readerProvider._currentFile;
			if (!currentFile || this._readerProvider._currentChapter === null) {
				vscode.window.showWarningMessage('请先加载文件并选择章节');
				return;
			}

			const chapter = currentFile.chapters[this._readerProvider._currentChapter];
			if (!chapter) {
				vscode.window.showWarningMessage('当前章节无效');
				return;
			}

			// 获取完整章节内容
			const fullContent = getChapterContentAsString(chapter);
			const currentOffset = this._readerProvider._scrollOffset;

			// 初始化字符偏移量为当前状态栏的偏移量
			this._lastCharOffset = currentOffset;
			this._lastScrollPercentage = this._calculateScrollPercentage(currentOffset, fullContent);

			const previewData = {
				chapterTitle: chapter.title,
				fullContent: fullContent,
				currentOffset: currentOffset,
				totalLength: fullContent.length,
				initialScrollPercentage: this._lastScrollPercentage
			};

			// 如果悬浮窗已存在，直接更新内容
			if (this._webviewPanel) {
				this._updateChapterPreview(previewData);
				return;
			}

			// 创建新的章节预览窗
			this._webviewPanel = vscode.window.createWebviewPanel(
				'thiefReaderChapterPreview',
				`${chapter.title} - 章节预览`,
				{
					viewColumn: vscode.ViewColumn.Beside,
					preserveFocus: true
				},
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: []
				}
			);

			// 设置WebView内容
			this._webviewPanel.webview.html = generateChapterPreviewHtml();

			// 设置消息处理
			this._setupChapterPreviewMessageHandling();

			// 设置面板关闭事件
			this._webviewPanel.onDidDispose(() => {
				this._onChapterPreviewDisposed();
			});

			// 更新内容并滚动到当前位置
			this._updateChapterPreview(previewData);
			this._isVisible = true;

			// 更新图标状态为悬浮窗模式
			this._readerProvider._statusBarDisplay.updateIcon(true);

			console.log('章节预览窗已显示:', chapter.title);

		} catch (error) {
			console.error('显示章节预览窗失败:', error);
			vscode.window.showErrorMessage('显示章节预览失败: ' + error.message);
		}
	}

	/**
	 * 在指定位置显示悬浮窗（保留旧方法用于兼容）
	 */
	async showAt(content) {
		// 重定向到新的章节预览方法
		return this.showChapterPreview();
	}

	/**
	 * 隐藏悬浮窗
	 */
	hide() {
		if (this._webviewPanel) {
			// 更新图标状态为正常模式
			this._readerProvider._statusBarDisplay.updateIcon(false);

			// 使用最后记录的滚动位置进行同步（避免向disposed WebView发送消息）
			this._syncLastScrollPositionToStatusBar();

			// 关闭面板
			this._webviewPanel.dispose();
			this._webviewPanel = null;
			this._isVisible = false;
			this._currentContent = null;

			console.log('章节预览窗已隐藏');
		}
	}

	/**
	 * 切换章节预览显示状态
	 */
	toggleChapterPreview() {
		if (this._isVisible) {
			this.hide();
		} else {
			this.showChapterPreview();
		}
	}

	/**
	 * 计算滚动百分比
	 */
	_calculateScrollPercentage(currentOffset, fullContent) {
		if (!fullContent || fullContent.length === 0) {
			return 0;
		}
		return Math.min(currentOffset / fullContent.length, 1);
	}

	/**
	 * 更新章节预览内容
	 */
	_updateChapterPreview(previewData) {
		if (!this._webviewPanel || !previewData) {
			return;
		}

		// 防抖更新
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
		}

		this._debounceTimer = setTimeout(() => {
			// 发送内容更新消息，包含保存的透明度
			this._webviewPanel.webview.postMessage({
				type: 'updateChapterPreview',
				data: previewData,
				popupTextOpacity: this._popupTextOpacity
			});
		}, 50); // 50ms防抖
	}

	/**
	 * 同步滚动位置到状态栏（安全版本，检查WebView状态）
	 */
	async _syncScrollPositionToStatusBar() {
		if (!this._webviewPanel || !this._isVisible) return;

		try {
			// 检查WebView是否还有效
			if (this._webviewPanel.webview) {
				// 请求WebView返回当前滚动位置
				this._webviewPanel.webview.postMessage({
					type: 'requestScrollPosition'
				});
			} else {
				// WebView无效，使用最后记录的位置
				this._syncLastScrollPositionToStatusBar();
			}
		} catch (error) {
			console.warn('同步滚动位置失败，使用备用方案:', error.message);
			// 发生错误时使用最后记录的滚动位置
			this._syncLastScrollPositionToStatusBar();
		}
	}

	/**
	 * 使用最后记录的滚动位置同步到状态栏
	 */
	_syncLastScrollPositionToStatusBar() {
		try {
			const currentFile = this._readerProvider._currentFile;
			if (!currentFile || this._readerProvider._currentChapter === null) return;

			const chapter = currentFile.chapters[this._readerProvider._currentChapter];
			if (!chapter) return;

			const fullContent = getChapterContentAsString(chapter);

			// 优先使用字符偏移量，如果没有则使用百分比计算
			let newTextOffset = this._lastCharOffset;

			// 如果字符偏移量为0但百分比不为0，说明可能是旧版本数据，使用百分比计算
			if (newTextOffset === 0 && this._lastScrollPercentage > 0) {
				newTextOffset = Math.floor(this._lastScrollPercentage * fullContent.length);
				console.log(`使用百分比计算偏移量: ${this._lastScrollPercentage.toFixed(4)} -> ${newTextOffset}`);
			} else {
				console.log(`使用字符偏移量: ${newTextOffset}`);
			}

			// 确保偏移量在有效范围内
			newTextOffset = Math.max(0, Math.min(newTextOffset, fullContent.length - 1));

			// 更新状态栏位置
			this._readerProvider._scrollOffset = newTextOffset;

			// 通过状态栏显示模块更新
			this._readerProvider._statusBarDisplay.updateDisplay({
				chapterTitle: chapter.title,
				scrollOffset: newTextOffset,
				content: fullContent,
				totalLength: fullContent.length
			});

			// 保存当前状态（包括章节位置）
			this._readerProvider._saveChapterPosition(this._readerProvider._currentChapter, newTextOffset);
			this._readerProvider._saveCurrentState();

			console.log(`✅ 弹窗滚动位置已同步到状态栏: 字符偏移量 ${newTextOffset}`);
		} catch (error) {
			console.error('同步滚动位置失败:', error);
		}
	}

	/**
	 * 检查悬浮窗是否可见
	 */
	isVisible() {
		return this._isVisible && this._webviewPanel !== null;
	}

	/**
	 * 从配置中加载弹窗文字透明度
	 */
	_loadPopupOpacity() {
		const config = vscode.workspace.getConfiguration('thief-reader');
		const savedOpacity = config.get('popupTextOpacity');
		if (savedOpacity !== undefined) {
			this._popupTextOpacity = savedOpacity;
		}
	}

	/**
	 * 保存弹窗文字透明度到配置
	 */
	_savePopupOpacity(value) {
		this._popupTextOpacity = Math.max(10, Math.min(100, value));
		vscode.workspace.getConfiguration('thief-reader').update('popupTextOpacity', this._popupTextOpacity, true);
	}

	/**
	 * 更新悬浮窗内容
	 */
	_updateContent(content) {
		if (!this._webviewPanel || !content) {
			return;
		}

		// 防抖更新
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
		}

		this._debounceTimer = setTimeout(() => {
			this._currentContent = content;

			// 发送内容更新消息
			this._webviewPanel.webview.postMessage({
				type: 'updateContent',
				data: content
			});
		}, 50); // 50ms防抖
	}

	/**
	 * 设置章节预览消息处理
	 */
	_setupChapterPreviewMessageHandling() {
		this._webviewPanel.webview.onDidReceiveMessage(message => {
			switch (message.type) {
				case 'scrollPositionChanged':
					this._handleScrollPositionChanged(message.scrollTop, message.scrollPercentage, message.charOffset);
					break;

				case 'popupOpacityChanged':
					this._savePopupOpacity(message.value);
					break;

				case 'hide':
					this.hide();
					break;

				case 'ready':
					// WebView准备就绪
					console.log('章节预览WebView已准备就绪');
					break;

				case 'scrollPositionResponse':
					// 处理滚动位置响应
					this._handleScrollPositionResponse(message.scrollTop, message.scrollPercentage, message.charOffset);
					break;
			}
		});
	}

	/**
	 * 设置消息处理（保留旧方法用于兼容）
	 */
	_setupMessageHandling() {
		return this._setupChapterPreviewMessageHandling();
	}

	/**
	 * 处理滚动位置变化
	 */
	_handleScrollPositionChanged(scrollTop, scrollPercentage, charOffset) {
		// 实时更新但不立即同步到状态栏（避免频繁更新）
		this._lastScrollTop = scrollTop;
		this._lastScrollPercentage = scrollPercentage;
		this._lastCharOffset = charOffset || 0;
	}

	/**
	 * 处理滚动位置响应（用于同步到状态栏）
	 */
	_handleScrollPositionResponse(scrollTop, scrollPercentage, charOffset) {
		try {
			const currentFile = this._readerProvider._currentFile;
			if (!currentFile || this._readerProvider._currentChapter === null) return;

			const chapter = currentFile.chapters[this._readerProvider._currentChapter];
			if (!chapter) return;

			const fullContent = getChapterContentAsString(chapter);

			// 优先使用字符偏移量，如果没有则使用百分比计算
			let newTextOffset = charOffset || Math.floor(scrollPercentage * fullContent.length);

			// 确保偏移量在有效范围内
			newTextOffset = Math.max(0, Math.min(newTextOffset, fullContent.length - 1));

			// 更新状态栏位置
			this._readerProvider._scrollOffset = newTextOffset;

			// 通过状态栏显示模块更新
			this._readerProvider._statusBarDisplay.updateDisplay({
				chapterTitle: chapter.title,
				scrollOffset: newTextOffset,
				content: fullContent,
				totalLength: fullContent.length
			});

			// 保存当前状态
			this._readerProvider._saveCurrentState();

			console.log(`滚动位置已同步: 字符偏移量 ${newTextOffset}`);
		} catch (error) {
			console.error('处理滚动位置响应失败:', error);
		}
	}

	/**
	 * 处理滚轮滚动事件
	 */
	_handleWheelScroll(deltaY, ctrlKey = false) {
		const newContent = this._scrollHandler.handleWheelEvent(deltaY, ctrlKey);
		if (newContent) {
			this._updateContent(newContent);
		}
	}

	/**
	 * 章节预览面板关闭事件处理
	 */
	_onChapterPreviewDisposed() {
		// 使用最后记录的滚动位置进行同步（WebView已经disposed，无法发送消息）
		this._syncLastScrollPositionToStatusBar();

		this._webviewPanel = null;
		this._isVisible = false;
		this._currentContent = null;

		// 清理滚动位置记录
		this._lastScrollTop = 0;
		this._lastScrollPercentage = 0;
		this._lastCharOffset = 0;

		console.log('章节预览面板已关闭');
	}

	/**
	 * 面板关闭事件处理（保留旧方法用于兼容）
	 */
	_onPanelDisposed() {
		return this._onChapterPreviewDisposed();
	}
}

module.exports = FloatingWindowManager;
