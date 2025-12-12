<template>
  <div class="bg-white overflow-hidden shadow-lg rounded-xl mb-6">
    <div class="px-4 py-5 sm:p-6">
      <h2 class="text-xl font-bold text-gray-900 mb-6">PI-Ingester 状態監視</h2>

      <div v-if="loading" class="text-center py-4">
        <p class="text-gray-500">読み込み中...</p>
      </div>

      <div v-else-if="status">
        <div v-if="status.lastUpdated" class="mb-4 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg p-3">
          <span class="font-semibold">最終更新:</span> {{ formatDate(status.lastUpdated) }}
        </div>

        <div v-if="status.equipments && status.equipments.length > 0" class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gradient-to-r from-gray-50 to-gray-100">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  設備
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  状態
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  最終取得時刻
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  最終成功時刻
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  エラー回数
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="(equipment, index) in status.equipments" :key="equipment.equipment"
                  :class="[
                    index % 2 === 0 ? '' : 'bg-gray-50/50',
                    equipment.status === 'error' ? 'border-l-4 border-red-500 bg-red-50/30' : '',
                    'hover:bg-blue-50 hover:shadow-md transition-all duration-200'
                  ]">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ equipment.equipment }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <span class="px-3 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full shadow-md" :class="getStatusClass(equipment.status)">
                    <span v-if="equipment.status === 'healthy'" class="mr-1">✓</span>
                    <span v-else-if="equipment.status === 'warning'" class="mr-1">⚠</span>
                    <span v-else-if="equipment.status === 'error'" class="mr-1">✕</span>
                    {{ getStatusText(equipment.status) }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(equipment.lastFetchTime) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(equipment.lastSuccessTime) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <span v-if="equipment.errorCount > 5" class="inline-flex items-center text-red-600 font-bold">
                    <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                    {{ equipment.errorCount }}
                  </span>
                  <span v-else-if="equipment.errorCount > 0" class="text-amber-600 font-semibold">
                    {{ equipment.errorCount }}
                  </span>
                  <span v-else class="text-gray-500">
                    {{ equipment.errorCount }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="status.message" class="text-center py-4">
          <p class="text-gray-500">{{ status.message }}</p>
        </div>

        <div v-else class="text-center py-4">
          <p class="text-gray-500">設備状態が見つかりません</p>
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
  status: Object,
  loading: Boolean
})

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleString('ja-JP')
}

function getStatusClass(status) {
  switch (status) {
    case 'healthy':
      return 'bg-gradient-to-r from-green-400 to-green-500 text-white'
    case 'warning':
      return 'bg-gradient-to-r from-amber-400 to-amber-500 text-white'
    case 'error':
      return 'bg-gradient-to-r from-red-400 to-red-500 text-white'
    default:
      return 'bg-gray-200 text-gray-700'
  }
}

function getStatusText(status) {
  switch (status) {
    case 'healthy':
      return '正常'
    case 'warning':
      return '警告'
    case 'error':
      return 'エラー'
    default:
      return '不明'
  }
}
</script>
