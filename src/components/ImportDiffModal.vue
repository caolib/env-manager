<script setup>
import { computed } from 'vue';
import { removePathVariablesFromConfig } from '../utils/configDiff';
import JsonDiffView from './JsonDiffView.vue';
import PathVariableDiffView from './PathVariableDiffView.vue';

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

const currentConfigWithoutPathVars = computed(() => removePathVariablesFromConfig(props.currentConfig));
const importConfigWithoutPathVars = computed(() => removePathVariablesFromConfig(props.importConfig));

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

        <div class="import-diff-content">
            <a-alert message="请仔细核对配置差异" description="上方单独展示 Path 变量逐项差异；下方 JSON 差异不再重复显示 Path 变量。"
                type="info" show-icon class="import-diff-alert" />

            <PathVariableDiffView :left-config="currentConfig" :right-config="importConfig" left-title="当前 JSON"
                :right-title="importTitle" />

            <JsonDiffView :left="currentConfigWithoutPathVars" :right="importConfigWithoutPathVars" left-title="当前 JSON"
                :right-title="importTitle" empty-text="除 Path 变量外没有差异" />
        </div>
    </a-modal>
</template>

<style scoped>
.import-diff-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    overflow: auto;
}

.import-diff-alert {
    flex-shrink: 0;
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
