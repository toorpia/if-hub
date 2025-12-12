<template>
  <div class="bg-white overflow-hidden shadow-lg rounded-xl mb-6">
    <div class="px-4 py-5 sm:p-6">
      <h2 class="text-xl font-bold text-gray-900 mb-6">設備一覧</h2>

      <div v-if="loading" class="text-center py-4">
        <p class="text-gray-500">読み込み中...</p>
      </div>

      <div v-else-if="equipments && equipments.length > 0" class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gradient-to-r from-gray-50 to-gray-100">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                設備名
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                タグ数
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                設定ファイル数
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                PI連携
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="(equipment, index) in equipments" :key="equipment.name"
                :class="[
                  index % 2 === 0 ? '' : 'bg-gray-50/50',
                  'hover:bg-blue-50 hover:shadow-md transition-all duration-200'
                ]">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {{ equipment.name }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ equipment.totalTags }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ equipment.configCount }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <span v-if="equipment.piIntegrationEnabled" class="px-3 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-gradient-to-r from-green-400 to-green-500 text-white shadow-md">
                  <svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                  </svg>
                  有効
                </span>
                <span v-else class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-200 text-gray-700">
                  無効
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="text-center py-4">
        <p class="text-gray-500">設備が見つかりません</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  equipments: Array,
  loading: Boolean
})
</script>
