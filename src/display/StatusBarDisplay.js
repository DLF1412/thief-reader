const vscode = require('vscode');

/**
 * 状态栏显示模块
 * 封装所有状态栏相关的逻辑，包括创建、更新和配置管理
 */
class StatusBarDisplay {
    constructor(context) {
        this._context = context;
        this._statusBarItem = null;
        this._opacity = 100;
        this._displayWidth = 60;
        this._scrollStep = 10;
        this._isFloatingWindowVisible = false;
        this._isContentHidden = false;
        this._savedOpacity = 100;
        this._savedDisplayWidth = 80; // 保存隐藏前的显示宽度
        this._statusBarHidden = false;
        this._lastContentLength = 0; // 保存上一次的正文内容长度

        // 加载配置
        this._loadOpacity();
        this._loadDisplaySettings();
    }

    /**
     * 初始化状态栏
     */
    init() {
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this._statusBarItem.text = "reader: 准备就绪 📖";
        this._statusBarItem.tooltip = '点击显示/隐藏章节预览 • 使用 Alt + 方向键滚动文字';
        this._statusBarItem.command = 'thief-reader.toggleChapterPreview';
        this._statusBarItem.show();
        this._context.subscriptions.push(this._statusBarItem);
    }

    /**
     * 更新状态栏显示内容
     * @param {Object} params - 显示参数
     * @param {string} params.chapterTitle - 章节标题
     * @param {number} params.scrollOffset - 当前滚动偏移量
     * @param {string} params.content - 完整章节内容
     * @param {number} params.totalLength - 内容总长度
     * @param {boolean} [params.forceVisible=false] - 是否强制显示
     */
    updateDisplay({ chapterTitle, scrollOffset, content, totalLength, forceVisible = false }) {
        if (!this._statusBarItem) return;

        // 如果状态栏被隐藏且不是强制显示，则不更新
        if (!forceVisible && this._statusBarHidden) {
            return;
        }

        // 使用配置的显示宽度（控制所有内容的总长度）
        const displayLength = this._displayWidth;

        // 标题部分最大长度为 25（包括标题、进度条、图标）
        const maxTitlePartLength = 25;

        // 计算标题和进度条
        let displayTitle = chapterTitle || '';
        // 进度条格式：[00.00%] 是 7 个字符
        const progressBracketLength = 7;
        // 图标长度
        const iconLength = 1;

        // 标题最大长度 = 最大长度 - 进度条长度 - 图标长度
        const maxTitleLength = maxTitlePartLength - progressBracketLength - iconLength;

        // 截断标题
        if (displayTitle.length > maxTitleLength) {
            displayTitle = displayTitle.substring(0, maxTitleLength - 1) + '…';
        }

        // 计算最大偏移量
        const maxScrollOffset = Math.max(0, totalLength - 1);

        // 确保偏移量在有效范围内
        const currentOffset = Math.max(0, Math.min(scrollOffset, maxScrollOffset));

        // 计算进度百分比（保留小数点后两位）
        const progress = totalLength > 0 ? (currentOffset / totalLength) * 100 : 0;
        const progressStr = `[${progress.toFixed(2).padStart(5, '0')}%]`;

        // 构建标题部分（最大 25 个字符，不足不补空格）
        const titlePart = `${displayTitle}${progressStr}`;

        // 应用透明度到文本颜色
        const alpha = (this._opacity / 100).toFixed(2);
        this._statusBarItem.color = `rgba(135, 135, 135, ${alpha})`;

        // 图标状态
        const icon = this._isFloatingWindowVisible ? '🔍' : '📖';

        // 如果显示长度为0（隐藏状态），不显示任何内容
        if (displayLength <= 0) {
            this._statusBarItem.text = '';
            console.log('状态栏已更新（隐藏模式）: 不显示任何内容');
            return;
        }

        // 计算正文内容长度 = 总长度 - 实际标题部分长度
        const contentLength = displayLength - titlePart.length;

        // 提取显示内容
        const actualEndPos = Math.min(currentOffset + contentLength, totalLength);
        const displayContent = content.substring(currentOffset, actualEndPos);

        // 更新状态栏文本
        this._statusBarItem.text = `${titlePart}${displayContent} ${icon}`;

        console.log(`状态栏已更新: ${titlePart} 偏移量${currentOffset} 图标${icon}`);
    }

    /**
     * 更新图标状态
     * @param {boolean} isFloatingWindowVisible - 悬浮窗是否可见
     */
    updateIcon(isFloatingWindowVisible) {
        this._isFloatingWindowVisible = isFloatingWindowVisible;
    }

    /**
     * 设置透明度
     * @param {number} value - 透明度值 (5-100)
     */
    setOpacity(value) {
        this._opacity = Math.max(5, Math.min(100, value));

        // 保存到配置
        vscode.workspace.getConfiguration('thief-reader').update('statusBarOpacity', this._opacity, true);

        // 如果当前有内容显示，立即更新
        console.log(`透明度已设置为: ${this._opacity}`);
    }

    /**
     * 获取当前透明度
     * @returns {number} 透明度值
     */
    getOpacity() {
        return this._opacity;
    }

    /**
     * 设置状态栏可见性
     * @param {boolean} visible - 是否可见
     */
    setVisible(visible) {
        if (!this._statusBarItem) return;

        if (visible) {
            this._statusBarItem.show();
        } else {
            this._statusBarItem.hide();
        }
    }

    /**
     * 设置状态栏文本（用于临时状态提示）
     * @param {string} text - 状态栏文本
     */
    setText(text) {
        if (!this._statusBarItem) return;
        this._statusBarItem.text = text;
    }

    /**
     * 从配置中加载透明度
     */
    _loadOpacity() {
        const config = vscode.workspace.getConfiguration('thief-reader');
        const savedOpacity = config.get('statusBarOpacity');
        if (savedOpacity !== undefined) {
            this._opacity = savedOpacity;
        }
    }

    /**
     * 从配置中加载显示设置
     */
    _loadDisplaySettings() {
        const config = vscode.workspace.getConfiguration('thief-reader');
        this._displayWidth = config.get('statusBarDisplayWidth', 60);
        this._scrollStep = config.get('scrollStep', 10);
    }

    /**
     * 设置显示宽度
     * @param {number} value - 显示宽度值 (30-100)
     */
    setDisplayWidth(value) {
        this._displayWidth = Math.max(30, Math.min(100, value));
        vscode.workspace.getConfiguration('thief-reader').update('statusBarDisplayWidth', this._displayWidth, true);
        console.log(`显示宽度已设置为: ${this._displayWidth}`);
    }

    /**
     * 获取显示宽度
     * @returns {number} 显示宽度值
     */
    getDisplayWidth() {
        return this._displayWidth;
    }

    /**
     * 设置滑动步长
     * @param {number} value - 滑动步长值 (1-90)
     */
    setScrollStep(value) {
        this._scrollStep = Math.max(1, Math.min(90, value));
        vscode.workspace.getConfiguration('thief-reader').update('scrollStep', this._scrollStep, true);
        console.log(`滑动步长已设置为: ${this._scrollStep}`);
    }

    /**
     * 获取滑动步长
     * @returns {number} 滑动步长值
     */
    getScrollStep() {
        return this._scrollStep;
    }

    /**
     * 计算当前章节正文内容长度
     * @param {string} chapterTitle - 章节标题
     * @returns {number} 正文内容长度
     */
    calculateContentLength(chapterTitle) {
        // 标题部分最大长度为 25（包括标题、进度条、图标）
        const maxTitlePartLength = 25;

        // 计算标题实际长度
        let displayTitle = chapterTitle || '';
        // 进度条格式：[00.00%] 是 7 个字符
        const progressBracketLength = 7;
        // 图标长度
        const iconLength = 1;

        // 标题最大长度 = 最大长度 - 进度条长度 - 图标长度
        const maxTitleLength = maxTitlePartLength - progressBracketLength - iconLength;

        // 截断标题
        if (displayTitle.length > maxTitleLength) {
            displayTitle = displayTitle.substring(0, maxTitleLength - 1) + '…';
        }

        // 计算进度百分比字符串
        const progressStr = `[${'0'.padStart(5, '0')}%]`;

        // 实际标题部分长度
        const actualTitlePartLength = displayTitle.length + progressStr.length;

        // 正文内容长度 = 总长度 - 标题部分长度
        return this._displayWidth - actualTitlePartLength;
    }

    /**
     * 根据章节标题长度自动调整滑动步长（增量方式）
     * 首次调用时直接设置为正文长度，后续按增量调整
     * @param {string} chapterTitle - 章节标题
     */
    autoAdjustScrollStep(chapterTitle) {
        // 标题部分最大长度为 25（包括标题、进度条、图标）
        const maxTitlePartLength = 25;

        // 计算标题实际长度
        let displayTitle = chapterTitle || '';
        // 进度条格式：[00.00%] 是 7 个字符
        const progressBracketLength = 7;
        // 图标长度
        const iconLength = 1;

        // 标题最大长度 = 最大长度 - 进度条长度 - 图标长度
        const maxTitleLength = maxTitlePartLength - progressBracketLength - iconLength;

        // 截断标题
        if (displayTitle.length > maxTitleLength) {
            displayTitle = displayTitle.substring(0, maxTitleLength - 1) + '…';
        }

        // 计算进度百分比字符串
        const progressStr = `[${'0'.padStart(5, '0')}%]`;

        // 实际标题部分长度
        const actualTitlePartLength = displayTitle.length + progressStr.length;

        // 计算新的正文内容长度
        const newContentLength = this._displayWidth - actualTitlePartLength;

        // 首次调用时直接设置为正文长度，后续按增量调整
        if (this._lastContentLength === 0) {
            // 首次调用，直接设置
            this._scrollStep = Math.max(10, Math.min(90, newContentLength));
            console.log(`首次设置滑动步长: ${this._scrollStep} (正文长度: ${newContentLength})`);
        } else {
            // 后续调用，按增量调整
            const delta = newContentLength - this._lastContentLength;
            this._scrollStep = Math.max(10, Math.min(90, this._scrollStep + delta));
            console.log(`增量调整滑动步长: ${this._scrollStep} (增量: ${delta}, 新正文长度: ${newContentLength})`);
        }

        // 保存当前正文内容长度
        this._lastContentLength = newContentLength;
    }

    /**
     * 切换状态栏内容显示/隐藏
     * 通过修改显示长度实现：隐藏时显示长度为0，显示时恢复原显示长度
     * 此变化不反应到配置界面上
     */
    toggleContentVisibility() {
        if (this._isContentHidden) {
            // 恢复显示：恢复保存的显示宽度
            this._displayWidth = this._savedDisplayWidth;
            this._isContentHidden = false;
            console.log(`状态栏内容已显示，显示宽度恢复为: ${this._displayWidth}`);
        } else {
            // 隐藏内容：保存当前显示宽度，设置显示宽度为0
            this._savedDisplayWidth = this._displayWidth;
            this._displayWidth = 0;
            this._isContentHidden = true;
            console.log('状态栏内容已隐藏，显示宽度设置为0');
        }
    }

    /**
     * 检查内容是否被隐藏
     * @returns {boolean} 是否被隐藏
     */
    isContentHidden() {
        return this._isContentHidden;
    }

    /**
     * 销毁状态栏
     */
    dispose() {
        if (this._statusBarItem) {
            this._statusBarItem.dispose();
            this._statusBarItem = null;
        }
    }
}

module.exports = StatusBarDisplay;
