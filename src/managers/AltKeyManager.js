/**
 * Alt键状态管理器类 - 监听和管理Alt键状态
 */
class AltKeyManager {
	constructor() {
		this._isAltPressed = false;
		this._listeners = [];
		this._disposables = [];
		this._forceEnabled = false; // 强制启用悬停功能（绕过Alt键检测）
	}

	/**
	 * 启动Alt键监听
	 */
	startListening() {
		// 由于VSCode API限制，我们使用编辑器选择变化来模拟键盘事件监听
		// 这里我们会在后续通过其他方式来检测Alt键状态
		console.log('Alt键监听已启动');
	}

	/**
	 * 检查Alt键是否按下
	 */
	isAltPressed() {
		return this._isAltPressed;
	}

	/**
	 * 设置Alt键状态（通过其他方式触发）
	 */
	setAltPressed(pressed) {
		const wasPressed = this._isAltPressed;
		this._isAltPressed = pressed;

		// 通知监听器
		if (wasPressed !== pressed) {
			this._notifyListeners(pressed);
		}
	}

	/**
	 * 强制启用/禁用悬停功能（绕过Alt键检测限制）
	 */
	setForceEnabled(enabled) {
		this._forceEnabled = enabled;
		console.log(`悬停功能强制${enabled ? '启用' : '禁用'}`);
	}

	/**
	 * 获取强制启用状态
	 */
	isForceEnabled() {
		return this._forceEnabled;
	}

	/**
	 * 切换强制启用状态
	 */
	toggleForceEnabled() {
		this._forceEnabled = !this._forceEnabled;
		console.log(`悬停功能强制${this._forceEnabled ? '启用' : '禁用'}`);
		return this._forceEnabled;
	}

	/**
	 * 添加状态变化监听器
	 */
	addListener(listener) {
		this._listeners.push(listener);
	}

	/**
	 * 移除监听器
	 */
	removeListener(listener) {
		const index = this._listeners.indexOf(listener);
		if (index > -1) {
			this._listeners.splice(index, 1);
		}
	}

	/**
	 * 通知所有监听器
	 */
	_notifyListeners(isPressed) {
		this._listeners.forEach(listener => {
			try {
				listener(isPressed);
			} catch (error) {
				console.error('Alt键状态监听器执行错误:', error);
			}
		});
	}

	/**
	 * 清理资源
	 */
	dispose() {
		this._disposables.forEach(disposable => disposable.dispose());
		this._disposables = [];
		this._listeners = [];
	}
}

module.exports = AltKeyManager;
