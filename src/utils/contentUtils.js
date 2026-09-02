/**
 * 内容处理辅助函数
 */

/**
 * 处理章节内容可能是数组或字符串的情况
 * @param {Object} chapter - 章节对象
 * @returns {string} 章节内容字符串
 */
function getChapterContentAsString(chapter) {
	if (!chapter || !chapter.content) {
		return '';
	}

	if (Array.isArray(chapter.content)) {
		return chapter.content.join('\n'); // 数组情况：用换行符连接
	} else if (typeof chapter.content === 'string') {
		return chapter.content; // 字符串情况：直接使用
	} else {
		console.warn('Unexpected chapter.content type:', typeof chapter.content, chapter.content);
		return String(chapter.content); // 强制转换为字符串
	}
}

module.exports = {
	getChapterContentAsString
};
