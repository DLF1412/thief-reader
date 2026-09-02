const fs = require('fs');
const path = require('path');

/**
 * 模板渲染器
 * 用于读取 HTML 模板文件并替换变量
 */
class TemplateRenderer {
	constructor() {
		this._templatesDir = __dirname;
		this._cache = new Map();
	}

	/**
	 * 读取模板文件
	 * @param {string} templateName - 模板文件名（不含扩展名）
	 * @returns {string} 模板内容
	 */
	_readTemplate(templateName) {
		// 检查缓存
		if (this._cache.has(templateName)) {
			return this._cache.get(templateName);
		}

		const templatePath = path.join(this._templatesDir, `${templateName}.html`);
		const content = fs.readFileSync(templatePath, 'utf8');

		// 缓存模板
		this._cache.set(templateName, content);

		return content;
	}

	/**
	 * 渲染模板
	 * @param {string} templateName - 模板文件名
	 * @param {Object} data - 要替换的变量
	 * @returns {string} 渲染后的 HTML
	 */
	render(templateName, data = {}) {
		let template = this._readTemplate(templateName);

		// 替换所有 ${variable} 占位符
		for (const [key, value] of Object.entries(data)) {
			const placeholder = new RegExp(`\\$\\{${key}\\}`, 'g');
			template = template.replace(placeholder, value || '');
		}

		return template;
	}

	/**
	 * 清除模板缓存
	 */
	clearCache() {
		this._cache.clear();
	}
}

// 创建单例实例
const templateRenderer = new TemplateRenderer();

module.exports = {
	TemplateRenderer,
	templateRenderer
};
