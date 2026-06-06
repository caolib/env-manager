<script setup>
import { computed } from 'vue';
import JsonDiffView from './JsonDiffView.vue';

const props = defineProps({
    open: Boolean,
    currentConfig: {
        type: Object,
        default: () => ({})
    },
    importConfig: {
        type: Object,
        default: () => ({})
    }
});

const emit = defineEmits(['update:open', 'confirm']);

const importTitle = computed(() => {
    return props.importConfig?.exportTime ? `导入 JSON：${props.importConfig.exportTime}` : '导入 JSON';
});

const handleOverwrite = () => {
    emit('confirm', 'overwrite');
    emit('update:open', false);
};

const handleIncremental = () => {
    emit('confirm', 'incremental');
    emit('update:open', false);
};

const handleCancel = () => {
    emit('update:open', false);
};
</script>

<template>
    <a-modal :open="open" width="100%" wrapClassName="full-modal" @cancel="handleCancel">
        <template #footer>
            <a-button @click="handleCancel">取消</a-button>
            <a-button @click="handleIncremental">增量导入</a-button>
            <a-button type="primary" @click="handleOverwrite">覆盖导入</a-button>
        </template>

        <a-alert message="请仔细核对完整 JSON 差异" description="覆盖导入按原逻辑写入；增量导入只添加当前不存在的配置，Path 变量会合并路径项并去重。"
            type="info" show-icon class="import-diff-alert" />

        <JsonDiffView :left="currentConfig" :right="importConfig" left-title="当前 JSON" :right-title="importTitle"
            empty-text="两个 JSON 没有差异" />
    </a-modal>
</template>

<style scoped>
.import-diff-alert {
    margin-bottom: 16px;
}

:deep(.json-diff-body) {
    max-height: calc(100vh - 230px);
}
</style>

<style>
.full-modal {
    top: 0;
    padding-bottom: 0;
    margin: 0;
}

.full-modal .ant-modal {
    top: 0;
    padding-bottom: 0;
    margin: 0;
    height: 100vh;
    max-width: 100%;
}

.full-modal .ant-modal-content {
    height: 100vh;
    display: flex;
    flex-direction: column;
    border-radius: 0;
}

.full-modal .ant-modal-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
</style>
