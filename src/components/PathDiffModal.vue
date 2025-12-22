<template>
  <div class="diff-view">
    <Table
      :columns="columns"
      :data-source="tableData"
      :pagination="false"
      size="small"
      :scroll="{ x: 600, y: 400 }"
      :bordered="true"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <span v-if="record.status === 'removed'" style="color: #ff4d4f;">
            ✗ 删除
          </span>
          <span v-else-if="record.status === 'added'" style="color: #52c41a;">
            ✓ 新增
          </span>
          <span v-else style="color: #666;">= 保持</span>
        </template>
        <template v-else-if="column.key === 'path'">
          <span v-if="record.status === 'removed'" style="color: #ff4d4f; text-decoration: line-through;">
            {{ record.path }}
          </span>
          <span v-else-if="record.status === 'added'" style="color: #52c41a; font-weight: bold;">
            {{ record.path }}
          </span>
          <span v-else>{{ record.path }}</span>
        </template>
      </template>
    </Table>

    <!-- 统计信息 -->
    <div class="stats-info" v-if="statistics.added > 0 || statistics.removed > 0">
      <Divider style="margin: 12px 0;" />
      <div class="stats-row">
        <span v-if="statistics.added > 0" style="color: #52c41a; margin-right: 16px;">
          ✓ 新增 {{ statistics.added }} 项
        </span>
        <span v-if="statistics.removed > 0" style="color: #ff4d4f; margin-right: 16px;">
          ✗ 删除 {{ statistics.removed }} 项
        </span>
        <span style="color: #666;">= 保持 {{ statistics.unchanged }} 项不变</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Table, Divider } from 'ant-design-vue';

const props = defineProps({
  oldPaths: {
    type: Array,
    required: true
  },
  newPaths: {
    type: Array,
    required: true
  }
});

// 计算差异
const removed = computed(() => {
  return props.oldPaths.filter(p => !props.newPaths.includes(p));
});

const added = computed(() => {
  return props.newPaths.filter(p => !props.oldPaths.includes(p));
});

const unchanged = computed(() => {
  return props.newPaths.filter(p => props.oldPaths.includes(p));
});

// 统计数据
const statistics = computed(() => ({
  added: added.value.length,
  removed: removed.value.length,
  unchanged: unchanged.value.length
}));

// 表格列配置
const columns = [
  {
    title: '状态',
    key: 'status',
    width: 80,
    align: 'center'
  },
  {
    title: '路径',
    key: 'path',
    width: 'auto'
  }
];

// 表格数据 - 保持原始顺序（修改后的顺序）
const tableData = computed(() => {
  const data = [];
  const seen = new Set();

  // 先遍历新路径（修改后的列表），这样能保持用户看到的顺序
  props.newPaths.forEach(path => {
    const wasInOld = props.oldPaths.includes(path);
    const status = wasInOld ? 'unchanged' : 'added';

    data.push({
      key: path,
      status,
      path
    });
    seen.add(path);
  });

  // 再遍历被删除的项（只在旧列表中）
  props.oldPaths.forEach(path => {
    if (!seen.has(path)) {
      data.push({
        key: path,
        status: 'removed',
        path
      });
      seen.add(path);
    }
  });

  return data;
});
</script>

<style scoped>
.diff-view {
  padding: 8px 0;
}

.stats-info {
  margin-top: 8px;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}

:deep(.ant-table) {
  font-size: 12px;
}

:deep(.ant-table-cell) {
  padding: 8px !important;
}
</style>

