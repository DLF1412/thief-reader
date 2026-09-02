const fs = require('fs');
const BaseParser = require('./BaseParser');

/**
 * TXT 文件解析器
 */
class TxtParser extends BaseParser {
	/**
	 * 获取支持的文件扩展名
	 * @returns {string[]}
	 */
	getSupportedExtensions() {
		return ['.txt'];
	}

	/**
	 * 解析 TXT 文件
	 * @param {string} filePath - TXT 文件路径
	 * @returns {Promise<Object>} 解析结果
	 */
	async parse(filePath) {
		const content = fs.readFileSync(filePath, 'utf8');
		const lineCount = content.split('\n').length;
		const pageCount = Math.ceil(lineCount / 50);
		const chapters = this.extractChaptersWithFallback(content);

		return {
			content,
			chapters,
			pageCount
		};
	}
}

module.exports = TxtParser;
