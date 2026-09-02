/**
 * 基础解析器接口
 * 所有文件解析器必须继承此基类并实现相应方法
 */
class BaseParser {
	/**
	 * 解析文件
	 * @param {string} filePath - 文件路径
	 * @returns {Promise<Object>} 解析结果 { content, chapters, pageCount }
	 */
	async parse(filePath) {
		throw new Error('parse() 方法必须在子类中实现');
	}

	/**
	 * 获取支持的文件扩展名
	 * @returns {string[]} 支持的扩展名数组
	 */
	getSupportedExtensions() {
		throw new Error('getSupportedExtensions() 方法必须在子类中实现');
	}

	/**
	 * 检查是否支持该文件类型
	 * @param {string} filePath - 文件路径
	 * @returns {boolean} 是否支持
	 */
	canParse(filePath) {
		const ext = this._getExtension(filePath);
		return this.getSupportedExtensions().includes(ext);
	}

	/**
	 * 获取文件扩展名（小写）
	 * @param {string} filePath - 文件路径
	 * @returns {string} 文件扩展名
	 */
	_getExtension(filePath) {
		const path = require('path');
		return path.extname(filePath).toLowerCase();
	}

	/**
	 * 提取章节信息（通用方法）
	 * @param {string} text - 文本内容
	 * @returns {Object[]} 章节数组
	 */
	extractChapters(text) {
		const chapters = [];
		const lines = text.split('\n');
		let currentChapter = null;

		// 扩展的章节检测规则
		const chapterPatterns = [
			// 中文章节模式
			/^第[一二三四五六七八九十\d]+章\s*[：:\-]?\s*(.+)/,
			/^第\d+章\s*[：:\-]?\s*(.+)/,
			/^[一二三四五六七八九十]+、\s*(.+)/,
			/^[\d]+\.\s*(.+)/,
			/^[\d]+[\s]*[、．.]\s*(.+)/,

			// 英文章节模式
			/^Chapter\s+\d+\s*[:\-]?\s*(.+)/i,
			/^CHAPTER\s+\d+\s*[:\-]?\s*(.+)/i,

			// 标题模式
			/^={3,}\s*(.+)\s*={3,}/,
			/^-{3,}\s*(.+)\s*-{3,}/,
			/^\*{3,}\s*(.+)\s*\*{3,}/,

			// 简单的标题模式
			/^【(.+)】$/,
			/^《(.+)》$/,

			// 数字编号
			/^(\d+)\s*[、．.]\s*(.+)/,
			/^(\d+)\s+(.+)/
		];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;

			// 检查是否匹配章节模式
			let isChapter = false;
			let chapterTitle = '';

			for (const pattern of chapterPatterns) {
				const match = line.match(pattern);
				if (match) {
					isChapter = true;
					chapterTitle = match[match.length - 1] || match[0];
					chapterTitle = chapterTitle.replace(/^\s*[：:\-]\s*/, '').trim();
					break;
				}
			}

			// 额外检查：如果行很短且看起来像标题
			if (!isChapter && line.length > 2 && line.length < 50) {
				if (/^[A-Z\s\d\-_]+$/.test(line)) {
					isChapter = true;
					chapterTitle = line;
				} else if (/^(序言|前言|引言|结语|附录|目录|索引|参考文献|致谢)/i.test(line)) {
					isChapter = true;
					chapterTitle = line;
				}
			}

			if (isChapter) {
				// 保存上一章节
				if (currentChapter) {
					chapters.push(currentChapter);
				}

				// 开始新章节
				currentChapter = {
					title: chapterTitle,
					startLine: i,
					content: []
				};
			} else if (currentChapter && line.length > 5) {
				// 添加内容到当前章节
				currentChapter.content.push(line);
			}
		}

		// 添加最后一个章节
		if (currentChapter) {
			chapters.push(currentChapter);
		}

		return chapters;
	}

	/**
	 * 带备用方案的章节提取
	 * @param {string} text - 文本内容
	 * @returns {Object[]} 章节数组
	 */
	extractChaptersWithFallback(text) {
		// 先尝试正常的章节提取
		const chapters = this.extractChapters(text);

		// 如果成功提取到章节，直接返回
		if (chapters.length > 0) {
			return chapters;
		}

		// 如果没有识别出章节，使用 Fallback 方案
		return this._createFallbackChapters(text);
	}

	/**
	 * 创建备用章节（使用前10个字作为标题）
	 * @param {string} text - 文本内容
	 * @returns {Object[]} 章节数组
	 */
	_createFallbackChapters(text) {
		const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
		const chapters = [];

		if (paragraphs.length === 0) {
			const lines = text.split('\n').filter(line => line.trim().length > 0);

			if (lines.length === 0) {
				const cleanContent = text.trim().replace(/\s+/g, ' ');
				if (cleanContent.length === 0) {
					chapters.push({
						title: '（空内容）',
						startLine: 0,
						content: []
					});
				} else {
					const title = cleanContent.substring(0, 10);
					chapters.push({
						title: title || '（空内容）',
						startLine: 0,
						content: [cleanContent]
					});
				}
			} else {
				lines.forEach((line) => {
					const trimmedLine = line.trim();
					const title = trimmedLine.substring(0, 10) + (trimmedLine.length > 10 ? '...' : '');

					chapters.push({
						title: title || '（无标题）',
						startLine: 0,
						content: [trimmedLine]
					});
				});
			}
		} else {
			paragraphs.forEach((paragraph) => {
				const lines = paragraph.split('\n').filter(line => line.trim().length > 0);
				if (lines.length > 0) {
					const firstLine = lines[0].trim();
					const title = firstLine.substring(0, 10) + (firstLine.length > 10 ? '...' : '');

					chapters.push({
						title: title || '（无标题）',
						startLine: 0,
						content: lines
					});
				}
			});
		}

		// 最终兜底：确保至少有一个章节
		if (chapters.length === 0) {
			chapters.push({
				title: '（空内容）',
				startLine: 0,
				content: []
			});
		}

		return chapters;
	}
}

module.exports = BaseParser;
