<template>
  <div class="bg-white overflow-hidden shadow-lg rounded-xl mb-6">
    <div class="px-4 py-5 sm:p-6">
      <h2 class="text-xl font-bold text-gray-900 mb-6">タグ統計情報</h2>

      <div v-if="loading" class="text-center py-4">
        <p class="text-gray-500">読み込み中...</p>
      </div>

      <div v-else-if="summary">
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-6">
          <div class="bg-gradient-to-br from-indigo-500 to-indigo-600 overflow-hidden shadow-lg rounded-xl p-6 transform hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 cursor-pointer">
            <dt class="text-sm font-medium text-indigo-100 truncate">登録タグ総数</dt>
            <dd class="mt-2 text-3xl font-bold text-white">{{ summary.totalCount }}</dd>
          </div>
          <div class="bg-gradient-to-br from-indigo-500 to-indigo-600 overflow-hidden shadow-lg rounded-xl p-6 transform hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 cursor-pointer">
            <dt class="text-sm font-medium text-indigo-100 truncate">データポイント総数</dt>
            <dd class="mt-2 text-3xl font-bold text-white">{{ formatNumber(summary.totalDataPoints) }}</dd>
          </div>
          <div class="bg-gradient-to-br from-indigo-500 to-indigo-600 overflow-hidden shadow-lg rounded-xl p-6 transform hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 cursor-pointer">
            <dt class="text-sm font-medium text-indigo-100 truncate">データ保持期間</dt>
            <dd class="mt-2 text-xl font-bold text-white">
              {{ formatDateRange(summary.dataRetention) }}
            </dd>
          </div>
        </div>

        <div v-if="summary.recentTags && summary.recentTags.length > 0">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">最近更新されたタグ (上位10件)</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    タグ名
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    最終更新時刻
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="(tag, index) in summary.recentTags" :key="tag.tag_name"
                    :class="[
                      index % 2 === 0 ? '' : 'bg-gray-50/50',
                      'hover:bg-blue-50 hover:shadow-md transition-all duration-200'
                    ]">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {{ tag.tag_name }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatDate(tag.last_update) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-4">
        <p class="text-gray-500">データが見つかりません</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  summary: Object,
  loading: Boolean
})

function formatNumber(num) {
  if (!num && num !== 0) return 'N/A'
  return num.toLocaleString('ja-JP')
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleString('ja-JP')
}

function formatDateRange(retention) {
  if (!retention || (!retention.oldest && !retention.newest)) return 'N/A'

  if (retention.oldest && retention.newest) {
    const oldest = new Date(retention.oldest)
    const newest = new Date(retention.newest)
    const days = Math.ceil((newest - oldest) / (1000 * 60 * 60 * 24))
    return `${days}日間`
  }

  return 'N/A'
}
</script>
