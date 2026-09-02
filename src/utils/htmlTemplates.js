/**
 * HTML模板生成函数
 */

/**
 * 生成章节预览的HTML内容
 * @returns {string} HTML字符串
 */
function generateChapterPreviewHtml() {
	return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>章节预览</title>
    <style>
        body {
            font-family: var(--vscode-font-family, 'Microsoft YaHei', sans-serif);
            font-size: 16px;
            line-height: 1.8;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 0;
            overflow: hidden;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

		.header {
			flex-shrink: 0;
			padding: 16px 20px 8px 20px;
			background: var(--vscode-titleBar-activeBackground);
			border-bottom: 1px solid var(--vscode-panel-border);
			min-height: 60px;
		}

		.header-top {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			margin-bottom: 8px;
		}

		.opacity-control {
			display: flex;
			align-items: center;
			gap: 10px;
			font-size: 12px;
			color: var(--vscode-titleBar-activeForeground);
			opacity: 0.8;
		}

		.opacity-control label {
			margin: 0;
		}

		.popup-opacity-slider {
			width: 120px;
			height: 4px;
			border-radius: 2px;
			background: var(--vscode-scrollbarSlider-background);
			outline: none;
			cursor: pointer;
			border: none;
		}

		.popup-opacity-slider:focus {
			outline: none !important;
			border: none !important;
			box-shadow: none !important;
		}

		.popup-opacity-slider::-webkit-slider-thumb {
			-webkit-appearance: none;
			width: 10px;
			height: 10px;
			border-radius: 50%;
			background: var(--vscode-titleBar-activeForeground);
			cursor: pointer;
			outline: none;
			border: none;
		}

		.popup-opacity-slider::-webkit-slider-thumb:focus {
			outline: none !important;
			border: none !important;
			box-shadow: none !important;
		}

		.popup-opacity-slider::-moz-range-thumb {
			width: 10px;
			height: 10px;
			border-radius: 50%;
			background: var(--vscode-titleBar-activeForeground);
			cursor: pointer;
			border: none;
			outline: none;
		}

		.popup-opacity-slider::-moz-range-thumb:focus {
			outline: none !important;
			border: none !important;
			box-shadow: none !important;
		}

		.chapter-title {
			font-weight: bold;
			font-size: 16px;
			color: var(--vscode-titleBar-activeForeground);
			word-wrap: break-word;
			word-break: break-all;
			line-height: 1.4;
			max-width: calc(100% - 40px);
		}

		.close-button {
			background: none;
			border: none;
			color: var(--vscode-titleBar-activeForeground);
			font-size: 16px;
			cursor: pointer;
			padding: 4px 8px;
			border-radius: 4px;
			flex-shrink: 0;
			margin-left: 10px;
			align-self: flex-start;
		}

        .close-button:hover {
            background: var(--vscode-titleBar-inactiveBackground);
        }

        .content-wrapper {
            flex: 1;
            overflow-y: auto;
            padding: 0;
            position: relative;
        }

        .position-marker {
            position: absolute;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--vscode-progressBar-background);
            z-index: 10;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .position-marker.visible {
            opacity: 1;
        }

        .content {
            padding: 24px 32px;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 2.0;
            letter-spacing: 0.5px;
        }

        .content::-webkit-scrollbar {
            display: none;
        }

        .footer {
            flex-shrink: 0;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            padding: 8px 20px;
            text-align: center;
            background: var(--vscode-statusBar-background);
            border-top: 1px solid var(--vscode-panel-border);
        }

        .loading {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 40px 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-top">
                <div class="chapter-title" id="chapterTitle">
                    正在加载章节...
                </div>
                <button class="close-button" onclick="closePreview()" title="关闭预览">
                    ✕
                </button>
            </div>
            <div class="opacity-control">
                <label for="popup-opacity-slider">文字透明度: <span id="popup-opacity-value">100</span>%</label>
                <input type="range" id="popup-opacity-slider" class="popup-opacity-slider" min="10" max="100" value="100" step="5">
            </div>
        </div>

        <div class="content-wrapper" id="contentWrapper">
            <div class="position-marker" id="positionMarker"></div>
            <div class="content" id="content">
                <div class="loading">正在加载章节内容...</div>
            </div>
        </div>

        <div class="footer">
            📖 滚动阅读整章内容 • Shift+Space 切换显示 • ESC 关闭
        </div>
    </div>

    <script>
        let currentScrollPercentage = 0;
        let isScrolling = false;
        let scrollTimeout = null;
        let popupTextOpacity = 100; // 弹窗文字透明度

        // 获取VSCode API
        const vscode = acquireVsCodeApi();

        // 关闭预览
        function closePreview() {
            vscode.postMessage({ type: 'hide' });
        }

        // 应用文字透明度
        function applyTextOpacity(opacity) {
            const contentElement = document.getElementById('content');
            if (contentElement) {
                contentElement.style.opacity = (opacity / 100).toFixed(2);
            }
        }

        // 监听透明度滑块
        const opacitySlider = document.getElementById('popup-opacity-slider');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', function(e) {
                const value = parseInt(e.target.value);
                popupTextOpacity = value;
                document.getElementById('popup-opacity-value').textContent = value;
                applyTextOpacity(value);

                // 发送消息保存透明度
                vscode.postMessage({
                    type: 'popupOpacityChanged',
                    value: value
                });
            });
        }

		// 监听滚动事件
		const contentWrapper = document.getElementById('contentWrapper');
		let fullContentText = '';

		// 计算可视区域第一个字符的偏移量
		function getCharOffsetAtTop() {
			const contentElement = document.getElementById('content');
			if (!contentElement || !fullContentText) return 0;

			try {
				// 获取content元素的位置
				const contentRect = contentElement.getBoundingClientRect();
				const wrapperRect = contentWrapper.getBoundingClientRect();

				// 计算可视区域顶部相对于content的位置
				const topY = wrapperRect.top - contentRect.top;

				// 如果在顶部之前，返回0
				if (topY <= 0) return 0;

				// 尝试使用document.caretRangeFromPoint获取字符位置
				const range = document.caretRangeFromPoint(contentRect.left + 10, wrapperRect.top + 5);
				if (range && range.startContainer) {
					// 遍历文本节点计算偏移量
					let charOffset = 0;
					const walker = document.createTreeWalker(
						contentElement,
						NodeFilter.SHOW_TEXT,
						null,
						false
					);

					let currentNode;
					while (currentNode = walker.nextNode()) {
						if (currentNode === range.startContainer) {
							charOffset += range.startOffset;
							return charOffset;
						}
						charOffset += currentNode.textContent.length;
					}
				}

				// 如果上述方法失败，使用百分比估算
				const scrollPercentage = contentWrapper.scrollTop / (contentWrapper.scrollHeight - contentWrapper.clientHeight);
				return Math.floor(scrollPercentage * fullContentText.length);
			} catch (e) {
				// 出错时使用百分比估算
				const scrollPercentage = contentWrapper.scrollTop / (contentWrapper.scrollHeight - contentWrapper.clientHeight);
				return Math.floor(scrollPercentage * fullContentText.length);
			}
		}

		contentWrapper.addEventListener('scroll', function(event) {
			const scrollTop = contentWrapper.scrollTop;
			const scrollHeight = contentWrapper.scrollHeight - contentWrapper.clientHeight;
			const scrollPercentage = scrollHeight > 0 ? scrollTop / scrollHeight : 0;

			currentScrollPercentage = scrollPercentage;
			isScrolling = true;

			// 使用精确方法计算字符偏移量
			const charOffset = getCharOffsetAtTop();

			// 调试日志
			if (scrollTop % 100 < 50) {
				console.log('Scroll:', scrollTop.toFixed(0) + 'px,', (scrollPercentage * 100).toFixed(1) + '%, charOffset:', charOffset);
			}

			// 显示位置标记
			const marker = document.getElementById('positionMarker');
			marker.style.top = scrollTop + 'px';
			marker.classList.add('visible');

			// 发送滚动位置变化，包含精确的字符偏移量
			vscode.postMessage({
				type: 'scrollPositionChanged',
				scrollTop: scrollTop,
				scrollPercentage: scrollPercentage,
				charOffset: charOffset
			});

			// 滚动停止后隐藏标记
			if (scrollTimeout) {
				clearTimeout(scrollTimeout);
			}
			scrollTimeout = setTimeout(() => {
				isScrolling = false;
				marker.classList.remove('visible');
			}, 500);
		});

        // 监听键盘事件
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                closePreview();
            }
        });

        // 监听来自扩展的消息
        window.addEventListener('message', function(event) {
            const message = event.data;

            switch (message.type) {
                case 'updateChapterPreview':
                    updateChapterPreview(message.data);
                    // 应用保存的透明度
                    if (message.popupTextOpacity !== undefined) {
                        popupTextOpacity = message.popupTextOpacity;
                        const slider = document.getElementById('popup-opacity-slider');
                        const valueSpan = document.getElementById('popup-opacity-value');
                        if (slider && valueSpan) {
                            slider.value = message.popupTextOpacity;
                            valueSpan.textContent = message.popupTextOpacity;
                        }
                        applyTextOpacity(message.popupTextOpacity);
                    }
                    break;

                case 'requestScrollPosition':
                    // 响应滚动位置请求，使用精确计算方法
                    vscode.postMessage({
                        type: 'scrollPositionResponse',
                        scrollTop: contentWrapper.scrollTop,
                        scrollPercentage: currentScrollPercentage,
                        charOffset: getCharOffsetAtTop()
                    });
                    break;
            }
        });

		// 更新章节预览内容
		function updateChapterPreview(data) {
			if (!data) return;

			// 更新标题
			document.getElementById('chapterTitle').textContent = data.chapterTitle;

            // 保存完整内容文本供滚动计算使用
            fullContentText = data.fullContent || '';

            // 更新内容并插入阅读位置标记
            const contentElement = document.getElementById('content');

            if (data.currentOffset !== undefined && data.fullContent) {
                // 在当前阅读位置插入标记
                const beforeText = data.fullContent.substring(0, data.currentOffset);
                const afterText = data.fullContent.substring(data.currentOffset);

                // 创建带标记的HTML内容
                contentElement.innerHTML = '';

                // 添加标记前的文本
                if (beforeText) {
                    const beforeSpan = document.createElement('span');
                    beforeSpan.textContent = beforeText;
                    contentElement.appendChild(beforeSpan);
                }

                // 添加当前阅读位置标记
                const markerSpan = document.createElement('span');
                markerSpan.id = 'currentReadingPosition';
                markerSpan.style.backgroundColor = 'var(--vscode-editor-findMatchHighlightBackground)';
                markerSpan.style.color = 'var(--vscode-editor-foreground)';
                markerSpan.style.padding = '2px 4px';
                markerSpan.style.borderRadius = '3px';
                markerSpan.style.boxShadow = '0 0 0 1px var(--vscode-editor-findMatchBorder)';

                // 获取状态栏显示长度的文字作为高亮内容
                const displayLength = 80;
                const highlightText = afterText.substring(0, Math.min(displayLength, afterText.length));
                markerSpan.textContent = highlightText;
                contentElement.appendChild(markerSpan);

                // 添加标记后的文本
                const remainingText = afterText.substring(highlightText.length);
                if (remainingText) {
                    const afterSpan = document.createElement('span');
                    afterSpan.textContent = remainingText;
                    contentElement.appendChild(afterSpan);
                }

                // 滚动到当前阅读位置
                setTimeout(() => {
                    const marker = document.getElementById('currentReadingPosition');
                    if (marker) {
                        marker.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                            inline: 'nearest'
                        });

                        // 滚动完成后，手动设置当前的字符偏移量
                        setTimeout(() => {
                            const scrollTop = contentWrapper.scrollTop;
                            const scrollHeight = contentWrapper.scrollHeight - contentWrapper.clientHeight;
                            const scrollPercentage = scrollHeight > 0 ? scrollTop / scrollHeight : 0;

                            currentScrollPercentage = scrollPercentage;

                            // 使用精确计算方法获取字符偏移量
                            // 因为滚动后DOM已稳定，可以准确计算
                            const calculatedOffset = getCharOffsetAtTop();

                            // 优先使用计算值，如果为0则使用初始值
                            const finalOffset = calculatedOffset > 0 ? calculatedOffset : data.currentOffset;

                            vscode.postMessage({
                                type: 'scrollPositionChanged',
                                scrollTop: scrollTop,
                                scrollPercentage: scrollPercentage,
                                charOffset: finalOffset
                            });

                            console.log('Initial position synced:', finalOffset);
                        }, 600);

                        // 显示位置标记线
                        const positionMarker = document.getElementById('positionMarker');
                        const markerRect = marker.getBoundingClientRect();
                        const wrapperRect = contentWrapper.getBoundingClientRect();
                        positionMarker.style.top = (markerRect.top - wrapperRect.top + contentWrapper.scrollTop) + 'px';
                        positionMarker.classList.add('visible');

                        setTimeout(() => {
                            positionMarker.classList.remove('visible');
                        }, 2000);
                    }
                }, 100);
            } else {
                // 如果没有偏移量，直接显示内容
                contentElement.textContent = data.fullContent;
            }
        }

        // 通知扩展WebView已准备就绪
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
}

module.exports = {
	generateChapterPreviewHtml
};
