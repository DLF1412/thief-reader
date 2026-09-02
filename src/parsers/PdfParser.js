const fs = require('fs');
const pdf = require('pdf-parse');
const BaseParser = require('./BaseParser');

/**
 * PDF 文件解析器
 */
class PdfParser extends BaseParser {
	/**
	 * 获取支持的文件扩展名
	 * @returns {string[]}
	 */
	getSupportedExtensions() {
		return ['.pdf'];
	}

	/**
	 * 解析 PDF 文件
	 * @param {string} filePath - PDF 文件路径
	 * @returns {Promise<Object>} 解析结果
	 */
	async parse(filePath) {
		const fileBuffer = fs.readFileSync(filePath);
		const pdfData = await pdf(fileBuffer);

		const content = pdfData.text;
		const pageCount = pdfData.numpages;
		const chapters = this.extractChaptersWithFallback(content);

		return {
			content,
			chapters,
			pageCount
		};
	}
}

module.exports = PdfParser;
