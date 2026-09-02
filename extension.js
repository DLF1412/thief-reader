// 'vscode' 模块包含 VS Code 扩展性 API
// 导入模块并在下面的代码中使用别名 vscode 引用它
const vscode = require('vscode');
const { ThiefReaderWebviewProvider } = require('./src');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// 使用控制台输出诊断信息 (console.log) 和错误 (console.error)
	// 这行代码只会在扩展激活时执行一次
	console.log('恭喜，您的扩展 "thief-reader" 现在已激活！');

	// 创建 WebView 提供者
	const provider = new ThiefReaderWebviewProvider(context);

	// 注册 WebView 提供者
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('thief-reader-main', provider)
	);

	// 保留原有的 Hello World 命令
	const disposable = vscode.commands.registerCommand('thief-reader.helloWorld', function () {
		// 向用户显示消息框
		vscode.window.showInformationMessage('来自 thief-reader 的问候！');
	});

	// 章节预览功能的切换命令
	const toggleChapterPreviewCommand = vscode.commands.registerCommand('thief-reader.toggleChapterPreview', function () {
		provider.toggleChapterPreview();
	});

	const showHoverPreviewCommand = vscode.commands.registerCommand('thief-reader.showHoverPreview', function () {
		// 直接显示悬停预览（用于测试）
		if (provider._currentFile && provider._currentChapter !== null) {
			const content = provider._mouseEventListener._getCurrentReaderContent();
			if (content) {
				provider._floatingWindowManager.showAt(content);
				vscode.window.showInformationMessage('悬停预览已显示');
			} else {
				vscode.window.showWarningMessage('没有可预览的内容');
			}
		} else {
			vscode.window.showWarningMessage('请先加载文件');
		}
	});

	const hideHoverPreviewCommand = vscode.commands.registerCommand('thief-reader.hideHoverPreview', function () {
		// 隐藏悬停预览
		provider._floatingWindowManager.hide();
		vscode.window.showInformationMessage('悬停预览已隐藏');
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(toggleChapterPreviewCommand);
	context.subscriptions.push(showHoverPreviewCommand);
	context.subscriptions.push(hideHoverPreviewCommand);
}

// 当您的扩展被停用时调用此方法
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
