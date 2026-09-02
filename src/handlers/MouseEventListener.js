const vscode = require('vscode');
const { getChapterContentAsString } = require('../utils/contentUtils');

/**
 * 鼠标事件监听器类 - 监听编辑器事件以控制悬浮窗显示
 */
class MouseEventListener {
	constructor(altKeyManager, floatingWindowManager, readerProvider, scrollHandler) {
		this._altKeyManager = altKeyManager;
		this._floatingWindowManager = floatingWindowManager;
		this._readerProvider = readerProvider;
		this._scrollHandler = scrollHandler;
		this._disposables = [];
		this._isHoverActive = false;
		this._showTimer = null;
		this._hideTimer = null;
		this._checkInterval = null;
	}

	/**
	 * 启动监听
	 */
	startListening() {
		// 监听编辑器光标位置变化（检测鼠标是否在编辑器中）
		const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
			this._onEditorSelectionChange(event);
		});
		this._disposables.push(selectionChangeDisposable);

		// 监听活动编辑器变化
		const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
			this._onEditorChange(editor);
		});
		this._disposables.push(editorChangeDisposable);

		// 监听Alt键状态变化
		this._altKeyManager.addListener(this._onAltKeyChanged.bind(this));

		// 定期检查编辑器状态（作为补充）
		this._startPeriodicCheck();

		console.log('编辑器事件监听器已启动');
	}

	/**
	 * 编辑器选择变化处理（检测鼠标活动）
	 */
	_onEditorSelectionChange(event) {
		// 检查是否启用悬停功能
		if (this._shouldShowFloatingWindow()) {
			this._showFloatingWindowDelayed();
		} else {
			this._hideFloatingWindowDelayed();
		}
	}

	/**
	 * 编辑器变化处理
	 */
	_onEditorChange(editor) {
		if (!editor) {
			// 没有活动编辑器，隐藏悬浮窗
			this._hideFloatingWindowDelayed();
		} else {
			// 有活动编辑器，检查是否应该显示
			if (this._shouldShowFloatingWindow()) {
				this._showFloatingWindowDelayed();
			}
		}
	}

	/**
	 * 定期检查编辑器状态
	 */
	_startPeriodicCheck() {
		// 每500ms检查一次状态
		this._checkInterval = setInterval(() => {
			if (this._shouldShowFloatingWindow()) {
				if (!this._isHoverActive) {
					this._showFloatingWindowDelayed();
				}
			} else {
				if (this._isHoverActive) {
					this._hideFloatingWindowDelayed();
				}
			}
		}, 500);
	}

	/**
	 * 检查是否应该显示悬浮窗
	 */
	_shouldShowFloatingWindow() {
		// 检查Alt键状态（真实的或强制启用的）
		if (!this._altKeyManager.isAltPressed() && !this._altKeyManager._forceEnabled) {
			return false;
		}

		// 检查是否有活动编辑器
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return false;
		}

		// 检查是否有当前阅读内容
		if (!this._readerProvider._currentFile || this._readerProvider._currentChapter === null) {
			return false;
		}

		return true;
	}

	/**
	 * Alt键状态变化处理
	 */
	_onAltKeyChanged(isPressed) {
		console.log(`Alt键状态变化: ${isPressed ? '按下' : '释放'}`);

		if (isPressed) {
			// Alt键按下，检查是否应该显示悬浮窗
			if (this._shouldShowFloatingWindow()) {
				this._showFloatingWindowDelayed();
			}
		} else {
			// Alt键释放，隐藏悬浮窗
			this._hideFloatingWindowDelayed();
		}
	}

	/**
	 * 延迟显示悬浮窗
	 */
	_showFloatingWindowDelayed() {
		// 清除隐藏定时器
		if (this._hideTimer) {
			clearTimeout(this._hideTimer);
			this._hideTimer = null;
		}

		// 如果已经在显示，不需要重新显示
		if (this._isHoverActive || this._floatingWindowManager.isVisible()) {
			return;
		}

		// 延迟显示（避免频繁触发）
		if (this._showTimer) {
			clearTimeout(this._showTimer);
		}

		this._showTimer = setTimeout(() => {
			this._showFloatingWindow();
		}, 200); // 200ms延迟
	}

	/**
	 * 延迟隐藏悬浮窗
	 */
	_hideFloatingWindowDelayed() {
		// 清除显示定时器
		if (this._showTimer) {
			clearTimeout(this._showTimer);
			this._showTimer = null;
		}

		// 延迟隐藏（给用户时间移动到悬浮窗）
		if (this._hideTimer) {
			clearTimeout(this._hideTimer);
		}

		this._hideTimer = setTimeout(() => {
			this._hideFloatingWindow();
		}, 300); // 300ms延迟
	}

	/**
	 * 显示悬浮窗
	 */
	async _showFloatingWindow() {
		try {
			if (this._isHoverActive) return;

			// 获取当前阅读内容
			const content = this._getCurrentReaderContent();
			if (!content) return;

			// 初始化滚动处理器
			this._scrollHandler.initialize();

			// 显示悬浮窗
			await this._floatingWindowManager.showAt(content);
			this._isHoverActive = true;

			console.log('悬浮窗已显示:', content.chapterTitle);

		} catch (error) {
			console.error('显示悬浮窗失败:', error);
		}
	}

	/**
	 * 隐藏悬浮窗
	 */
	_hideFloatingWindow() {
		if (this._isHoverActive) {
			this._floatingWindowManager.hide();
			this._scrollHandler.reset();
			this._isHoverActive = false;
		}
	}

	/**
	 * 获取当前阅读内容
	 */
	_getCurrentReaderContent() {
		const currentFile = this._readerProvider._currentFile;
		if (!currentFile || !currentFile.chapters || this._readerProvider._currentChapter === null) {
			return null;
		}

		const chapter = currentFile.chapters[this._readerProvider._currentChapter];
		if (!chapter) return null;

		const scrollOffset = this._readerProvider._scrollOffset;
		const displayLength = 300; // 显示300个字符

		// 使用辅助函数处理内容
		const fullContent = getChapterContentAsString(chapter);
		if (!fullContent) {
			console.error('Empty or invalid chapter content in getCurrentReaderContent');
			return null;
		}

		// 获取文字内容
		const text = fullContent.substring(scrollOffset, scrollOffset + displayLength);
		const position = `${scrollOffset}-${scrollOffset + text.length}/${fullContent.length}`;

		return {
			text: text,
			chapterTitle: chapter.title,
			position: position,
			scrollPosition: scrollOffset,
			maxPosition: fullContent.length,
			hasMore: scrollOffset + displayLength < fullContent.length
		};
	}

	/**
	 * 手动触发Alt键状态（用于测试或命令触发）
	 */
	triggerAltKey(pressed) {
		this._altKeyManager.setAltPressed(pressed);
	}

	/**
	 * 清理资源
	 */
	dispose() {
		// 清理定时器
		if (this._showTimer) {
			clearTimeout(this._showTimer);
			this._showTimer = null;
		}
		if (this._hideTimer) {
			clearTimeout(this._hideTimer);
			this._hideTimer = null;
		}
		if (this._checkInterval) {
			clearInterval(this._checkInterval);
			this._checkInterval = null;
		}

		// 隐藏悬浮窗
		this._hideFloatingWindow();

		// 移除Alt键监听器
		this._altKeyManager.removeListener(this._onAltKeyChanged.bind(this));

		// 清理所有disposables
		this._disposables.forEach(disposable => disposable.dispose());
		this._disposables = [];
	}
}

module.exports = MouseEventListener;
