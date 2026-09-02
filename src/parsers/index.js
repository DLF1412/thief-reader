const path = require('path');
const BaseParser = require('./BaseParser');
const PdfParser = require('./PdfParser');
const TxtParser = require('./TxtParser');
const EpubParser = require('./EpubParser');

/**
 * 解析器工厂
 * 根据文件扩展名返回对应的解析器实例
 */
class ParserFactory {
	constructor() {
		// 注册所有解析器
		this._parsers = [
			new PdfParser(),
			new TxtParser(),
			new EpubParser()
		];
	}

	/**
	 * 根据文件路径获取对应的解析器
	 * @param {string} filePath - 文件路径
	 * @returns {BaseParser|null} 解析器实例，如果不支持则返回 null
	 */
	getParser(filePath) {
		const ext = path.extname(filePath).toLowerCase();
		return this._parsers.find(parser => parser.getSupportedExtensions().includes(ext)) || null;
	}

	/**
	 * 检查是否支持该文件类型
	 * @param {string} filePath - 文件路径
	 * @returns {boolean} 是否支持
	 */
	canParse(filePath) {
		return this.getParser(filePath) !== null;
	}

	/**
	 * 获取所有支持的文件扩展名
	 * @returns {string[]} 支持的扩展名数组
	 */
	getSupportedExtensions() {
		const extensions = [];
		this._parsers.forEach(parser => {
			extensions.push(...parser.getSupportedExtensions());
		});
		return extensions;
	}

	/**
	 * 解析文件
	 * @param {string} filePath - 文件路径
	 * @returns {Promise<Object>} 解析结果
	 */
	async parse(filePath) {
		const parser = this.getParser(filePath);
		if (!parser) {
			throw new Error(`不支持的文件格式: ${path.extname(filePath)}`);
		}
		return parser.parse(filePath);
	}
}

// 创建单例实例
const parserFactory = new ParserFactory();

module.exports = {
	BaseParser,
	PdfParser,
	TxtParser,
	EpubParser,
	ParserFactory,
	parserFactory
};
