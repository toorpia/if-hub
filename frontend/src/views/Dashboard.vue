<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
    <header class="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 shadow-lg">
      <div class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <h1 class="text-3xl font-bold text-white">IF-HUB Dashboard</h1>
        <p class="text-blue-100 text-sm mt-1">リアルタイム監視システム</p>
      </div>
    </header>

    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <SystemOverview :overview="overview" :loading="loading" />
        <EquipmentList :equipments="equipments" :loading="loading" />
        <TagSummary :summary="tagSummary" :loading="loading" />
        <IngesterStatus :status="ingesterStatus" :loading="loading" />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import SystemOverview from '../components/SystemOverview.vue'
import EquipmentList from '../components/EquipmentList.vue'
import TagSummary from '../components/TagSummary.vue'
import IngesterStatus from '../components/IngesterStatus.vue'

const overview = ref(null)
const equipments = ref([])
const tagSummary = ref(null)
const ingesterStatus = ref(null)
const loading = ref(true)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

async function fetchData() {
  try {
    loading.value = true

    const [overviewRes, equipmentsRes, tagsRes, ingesterRes] = await Promise.all([
      axios.get(`${API_BASE_URL}/api/dashboard/overview`),
      axios.get(`${API_BASE_URL}/api/dashboard/equipments`),
      axios.get(`${API_BASE_URL}/api/dashboard/tags/summary`),
      axios.get(`${API_BASE_URL}/api/dashboard/ingester/status`)
    ])

    overview.value = overviewRes.data
    equipments.value = equipmentsRes.data.equipments
    tagSummary.value = tagsRes.data
    ingesterStatus.value = ingesterRes.data
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
  // ポーリング: 30秒ごとに更新
  setInterval(fetchData, 30000)
})
</script>
