<template>
  <div class="bg-white overflow-hidden shadow-lg rounded-xl mb-6">
    <div class="px-4 py-5 sm:p-6">
      <h2 class="text-xl font-bold text-gray-900 mb-6">システム概要</h2>

      <div v-if="loading" class="text-center py-8">
        <p class="text-gray-500">読み込み中...</p>
      </div>

      <div v-else-if="overview" class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <!-- 設備数カード -->
        <div class="bg-gradient-to-br from-blue-500 to-blue-600 overflow-hidden shadow-lg rounded-xl transform hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 cursor-pointer">
          <div class="p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-blue-100 truncate">設備数</dt>
                  <dd class="text-3xl font-bold text-white">{{ overview.equipmentCount }}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <!-- タグ数カード -->
        <div class="bg-gradient-to-br from-emerald-500 to-emerald-600 overflow-hidden shadow-lg rounded-xl transform hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 cursor-pointer">
          <div class="p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-emerald-100 truncate">タグ数</dt>
                  <dd class="text-3xl font-bold text-white">{{ overview.tagCount }}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <!-- gTag数カード -->
        <div class="bg-gradient-to-br from-purple-500 to-purple-600 overflow-hidden shadow-lg rounded-xl transform hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 cursor-pointer">
          <div class="p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-purple-100 truncate">gTag数</dt>
                  <dd class="text-3xl font-bold text-white">{{ overview.gtagCount }}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <!-- PI-Ingesterカード -->
        <div class="overflow-hidden shadow-lg rounded-xl transform hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 cursor-pointer" :class="ingesterGradientClass">
          <div class="p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium truncate" :class="ingesterLabelClass">PI-Ingester</dt>
                  <dd class="text-3xl font-bold text-white">{{ ingesterStatusText }}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="overview && overview.lastDataUpdate" class="mt-6 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
        <span class="font-medium">最終データ更新:</span> {{ formatDate(overview.lastDataUpdate) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  overview: Object,
  loading: Boolean
})

const ingesterGradientClass = computed(() => {
  if (!props.overview?.ingester) return 'bg-gradient-to-br from-gray-400 to-gray-500'
  const status = props.overview.ingester.status
  return status === 'running'
    ? 'bg-gradient-to-br from-green-500 to-green-600'
    : status === 'stopped'
    ? 'bg-gradient-to-br from-amber-500 to-amber-600'
    : 'bg-gradient-to-br from-gray-400 to-gray-500'
})

const ingesterLabelClass = computed(() => {
  if (!props.overview?.ingester) return 'text-gray-100'
  const status = props.overview.ingester.status
  return status === 'running' ? 'text-green-100' : status === 'stopped' ? 'text-amber-100' : 'text-gray-100'
})

const ingesterStatusText = computed(() => {
  if (!props.overview?.ingester) return '不明'
  const status = props.overview.ingester.status
  return status === 'running' ? '稼働中' : status === 'stopped' ? '停止' : '不明'
})

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleString('ja-JP')
}
</script>
