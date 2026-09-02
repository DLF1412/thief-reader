const EPub = require('epub2').EPub;
const BaseParser = require('./BaseParser');

/**
 * EPUB 文件解析器
 */
class EpubParser extends BaseParser {
	/**
	 * 获取支持的文件扩展名
	 * @returns {string[]}
	 */
	getSupportedExtensions() {
		return ['.epub'];
	}

	/**
	 * 解析 EPUB 文件
	 * @param {string} filePath - EPUB 文件路径
	 * @returns {Promise<Object>} 解析结果
	 */
	async parse(filePath) {
		return new Promise((resolve, reject) => {
			const epub = new EPub(filePath);

			epub.on('error', (err) => {
				reject(new Error(`EPUB解析错误: ${err.message}`));
			});

			epub.on('end', async () => {
				try {
					const chapters = [];
					let fullContent = '';

					// 获取EPUB的章节流
					const flow = epub.flow;

					// 构建 toc href→title 映射
					const tocHrefMap = {};
					if (epub.toc && Array.isArray(epub.toc)) {
						for (const tocItem of epub.toc) {
							if (tocItem.href && tocItem.title) {
								const cleanHref = tocItem.href.split('#')[0];
								if (!tocHrefMap[cleanHref]) {
									tocHrefMap[cleanHref] = tocItem.title;
								}
							}
						}
					}

					let chapterSeq = 0;
					let lastValidTitle = '';

					// 遍历所有章节
					for (let i = 0; i < flow.length; i++) {
						const chapterId = flow[i].id;
						const flowHref = flow[i].href || '';

						try {
							// 获取章节内容
							const chapterData = await new Promise((resolveChapter, rejectChapter) => {
								epub.getChapter(chapterId, (error, text) => {
									if (error) {
										rejectChapter(error);
									} else {
										resolveChapter(text);
									}
								});
							});

							// 在去除HTML标签前，先尝试从 h1~h6 标签提取标题
							const contentTitle = this._extractTitleFromHtml(chapterData);

							// 移除HTML标签，提取纯文本
							const textContent = this._stripHtml(chapterData);

							// 记录 TOC 标题
							const flowTocTitle = tocHrefMap[flowHref] || flow[i].title;
							if (flowTocTitle) {
								lastValidTitle = flowTocTitle.replace(/\s+/g, " ").trim();
							}

							if (textContent.trim().length > 0) {
								chapterSeq++;

								// 标题优先级
								let title = tocHrefMap[flowHref]
									|| flow[i].title
									|| contentTitle;

								// split 文件标题继承
								if (!title && lastValidTitle && flowHref.includes("_split_")) {
									title = lastValidTitle + "（续）";
								}

								if (!title) {
									const firstLine = textContent.split("\n").find(line => line.trim().length > 0);
									if (firstLine) {
										const trimmed = firstLine.trim();
										title = trimmed.length > 20
											? trimmed.substring(0, 20) + "..."
											: trimmed;
									}
								}

								if (!title) {
									title = `章节 ${chapterSeq}`;
								}

								// 清理标题中的多余空白
								title = title.replace(/\s+/g, " ").trim();
								// 更新 lastValidTitle
								if (!flowHref.includes("_split_") || tocHrefMap[flowHref] || flow[i].title || contentTitle) {
									lastValidTitle = title;
								}

								chapters.push({
									title: title,
									startLine: 0,
									content: textContent.split('\n').filter(line => line.trim().length > 0)
								});

								fullContent += textContent + '\n';
							}
						} catch (chapterError) {
							console.warn(`跳过章节 ${chapterId}:`, chapterError);
						}
					}

					resolve({
						content: fullContent,
						chapters: chapters.length > 0 ? chapters : [{
							title: '全文内容',
							startLine: 0,
							content: fullContent.split('\n').filter(line => line.trim().length > 0)
						}],
						pageCount: chapters.length
					});
				} catch (error) {
					reject(error);
				}
			});

			// 开始解析
			epub.parse();
		});
	}

	/**
	 * 从HTML内容中提取标题（h1~h6标签）
	 * @param {string} html - HTML内容
	 * @returns {string|null} 提取到的标题文本
	 */
	_extractTitleFromHtml(html) {
		if (!html) {
			return null;
		}
		for (let level = 1; level <= 6; level++) {
			const regex = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'i');
			const match = html.match(regex);
			if (match) {
				const title = match[1].replace(/<[^>]+>/g, '').trim();
				if (title.length > 0) {
					return title;
				}
			}
		}
		return null;
	}

	/**
	 * 移除HTML标签，提取纯文本
	 * @param {string} html - HTML内容
	 * @returns {string} 纯文本
	 */
	_stripHtml(html) {
		let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

		// 移除媒体标签
		text = text.replace(/<img[^>]*\/?>/gi, '');
		text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
		text = text.replace(/<figure\b[^<]*(?:(?!<\/figure>)<[^<]*)*<\/figure>/gi, '');
		text = text.replace(/<picture\b[^<]*(?:(?!<\/picture>)<[^<]*)*<\/picture>/gi, '');
		text = text.replace(/<canvas\b[^<]*(?:(?!<\/canvas>)<[^<]*)*<\/canvas>/gi, '');
		text = text.replace(/<video\b[^<]*(?:(?!<\/video>)<[^<]*)*<\/video>/gi, '');
		text = text.replace(/<audio\b[^<]*(?:(?!<\/audio>)<[^<]*)*<\/audio>/gi, '');
		text = text.replace(/<embed[^>]*\/?>/gi, '');
		text = text.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
		text = text.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

		// 移除base64图片和图片URL
		text = text.replace(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/gi, '');
		text = text.replace(/https?:\/\/[^\s<>"]+\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)/gi, '');

		// 替换HTML标签
		text = text.replace(/<br\s*\/?>/gi, '\n');
		text = text.replace(/<\/p>/gi, '\n\n');
		text = text.replace(/<\/div>/gi, '\n');
		text = text.replace(/<\/h[1-6]>/gi, '\n\n');
		text = text.replace(/<\/li>/gi, '\n');
		text = text.replace(/<\/tr>/gi, '\n');

		// 移除所有剩余的HTML标签
		text = text.replace(/<[^>]+>/g, '');

		// 解码HTML实体
		text = text.replace(/&nbsp;/g, ' ');
		text = text.replace(/&lt;/g, '<');
		text = text.replace(/&gt;/g, '>');
		text = text.replace(/&amp;/g, '&');
		text = text.replace(/&quot;/g, '"');
		text = text.replace(/&#39;/g, "'");
		text = text.replace(/&#8217;/g, "'");
		text = text.replace(/&#8220;/g, '"');
		text = text.replace(/&#8221;/g, '"');
		text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

		// 清理多余的空白
		text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
		text = text.replace(/[ \t]+/g, ' ');
		text = text.trim();

		return text;
	}
}

module.exports = EpubParser;
