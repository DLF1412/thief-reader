/**
 * 存储管理器类 - 处理文件列表和阅读状态的持久化
 */
class StorageManager {
	constructor(context) {
		this._context = context;
	}

	/**
	 * 保存文件列表
	 */
	async saveFiles(files) {
		try {
			// 序列化文件列表，只保存必要信息
			const serializedFiles = files.map(file => ({
				id: file.id,
				name: file.name,
				type: file.type,
				path: file.path || '',
				fullText: file.type === '粘贴' ? file.fullText : '',  // 只保存粘贴内容的文本
				addedTime: file.addedTime || Date.now(),
				status: file.status || 'active',
				// 保存阅读位置信息
				lastChapter: file.lastChapter ?? null,
				lastScrollOffset: file.lastScrollOffset ?? 0,
				lastReadTime: file.lastReadTime ?? null,
				// 保存章节位置映射
				chapterPositions: file.chapterPositions || {}
			}));

			await this._context.globalState.update('thief-reader.files', serializedFiles);
		} catch (error) {
			console.error('保存文件列表失败:', error);
		}
	}

	/**
	 * 加载文件列表
	 */
	async loadFiles() {
		try {
			const files = await this._context.globalState.get('thief-reader.files');
			return files || [];
		} catch (error) {
			console.error('加载文件列表失败:', error);
			return [];
		}
	}

	/**
	 * 保存阅读状态
	 */
	async saveReadingState(state) {
		try {
			await this._context.globalState.update('thief-reader.readingState', {
				currentFileId: state.currentFileId,
				currentChapter: state.currentChapter,
				scrollOffset: state.scrollOffset,
				lastSaveTime: Date.now()
			});
		} catch (error) {
			console.error('保存阅读状态失败:', error);
		}
	}

	/**
	 * 加载阅读状态
	 */
	async loadReadingState() {
		try {
			const state = await this._context.globalState.get('thief-reader.readingState');
			return state || null;
		} catch (error) {
			console.error('加载阅读状态失败:', error);
			return null;
		}
	}

	/**
	 * 清空所有存储数据
	 */
	async clearAll() {
		try {
			await this._context.globalState.update('thief-reader.files', undefined);
			await this._context.globalState.update('thief-reader.readingState', undefined);
		} catch (error) {
			console.error('清空数据失败:', error);
		}
	}
}

module.exports = StorageManager;
