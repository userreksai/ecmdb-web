<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <h2 class="sidebar-title">工单模板</h2>
      <span class="total-count">{{ totalCount }} 个模板</span>
    </div>

    <!-- 添加可滚动的导航区域 -->
    <div class="category-nav-container">
      <div class="category-nav">
        <!-- 添加"我的收藏"选项 -->
        <div
          class="category-item"
          :class="{ active: selectedCategory === 'favorites' }"
          @click="selectedCategory = 'favorites'"
        >
          <div class="category-icon star-icon">
            <el-icon><Star /></el-icon>
          </div>
          <div class="category-info">
            <span class="category-name">我的收藏</span>
            <span class="category-count">{{ favoriteCount }}</span>
          </div>
        </div>

        <!-- 添加"全部工单"选项 -->
        <div class="category-item" :class="{ active: selectedCategory === 'all' }" @click="selectedCategory = 'all'">
          <div class="category-icon">
            <el-icon><Grid /></el-icon>
          </div>
          <div class="category-info">
            <span class="category-name">全部工单</span>
            <span class="category-count">{{ totalCount }}</span>
          </div>
        </div>

        <div
          v-for="item in templateCombinations"
          :key="item.id"
          class="category-item"
          :class="{ active: selectedCategory === item.id }"
          @click="selectedCategory = item.id"
        >
          <div class="category-icon">
            <el-icon><Folder /></el-icon>
          </div>
          <div class="category-info">
            <span class="category-name">{{ item.name }}</span>
            <span class="category-count">{{ item.templates.length }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Grid, Folder, Star } from "@element-plus/icons-vue"

defineProps<{
  templateCombinations: Array<{ id: number; name: string; templates: any[] }>
  favoriteCount: number
  totalCount: number
}>()

const selectedCategory = defineModel<number | "all" | "favorites">("selectedCategory", {
  required: true
})
</script>

<style lang="scss" scoped>
.sidebar {
  width: calc(12rem + 2vw);
  background: white;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 4rem);
  max-height: calc(100vh - 4rem);

  @media (max-width: 768px) {
    width: 100%;
    height: auto;
    max-height: none;
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
  }

  @media (min-width: 1280px) and (max-width: 1440px) {
    width: calc(11rem + 1.5vw);
    height: calc(100vh - 3rem);
    max-height: calc(100vh - 3rem);
  }
}

.sidebar-header {
  padding: calc(0.8rem + 0.2vw);
  margin-bottom: 0;
  padding-bottom: calc(0.6rem + 0.1vw);
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;

  @media (max-width: 768px) {
    padding: calc(0.6rem + 0.1vw);
  }
}

.category-nav-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 calc(0.8rem + 0.2vw) calc(1.2rem + 0.3vw);

  @media (max-width: 768px) {
    padding: 0 calc(0.6rem + 0.1vw) calc(1rem + 0.2vw);
    overflow-y: visible;
  }
}

.category-nav {
  display: flex;
  flex-direction: column;
  gap: calc(0.15rem + 0.05vw);
}

.category-item {
  display: flex;
  align-items: center;
  gap: calc(0.5rem + 0.1vw);
  padding: calc(0.5rem + 0.1vw);
  border-radius: calc(0.4rem + 0.1vw);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #f8fafc;
  }

  &.active {
    background: #eff6ff;
    border: 1px solid #dbeafe;

    .category-name {
      color: #1d4ed8;
      font-weight: 600;
    }

    .category-icon {
      background: #dbeafe;
      color: #1d4ed8;
    }
  }
}

.category-icon {
  width: calc(1.6rem + 0.2vw);
  height: calc(1.6rem + 0.2vw);
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  border-radius: calc(0.3rem + 0.1vw);
  color: #64748b;
  transition: all 0.2s ease;

  &.star-icon {
    background: #fef3c7 !important;
    color: #d97706 !important;
  }
}

.category-item.active .category-icon.star-icon {
  background: #fde68a !important;
  color: #b45309 !important;
}

.category-info {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.category-name {
  font-size: calc(0.7rem + 0.1vw);
  font-weight: 500;
  color: #374151;
}

.category-count {
  font-size: calc(0.6rem + 0.1vw);
  color: #9ca3af;
  background: #f9fafb;
  padding: calc(0.1rem + 0.05vw) calc(0.3rem + 0.1vw);
  border-radius: calc(0.5rem + 0.1vw);
}
</style>
