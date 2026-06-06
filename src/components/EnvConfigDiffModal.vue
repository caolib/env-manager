<script setup>
import { computed } from 'vue';
import { ArrowLeftOutlined } from '@ant-design/icons-vue';
import JsonDiffView from './JsonDiffView.vue';

const props = defineProps({
    open: Boolean,
    currentConfig: {
        type: Object,
        default: () => ({})
    },
    compareConfig: {
        type: Object,
        default: () => ({})
    },
    compareFile: {
        type: Object,
        default: () => ({})
    }
});

const emit = defineEmits(['update:open']);

const title = computed(() => {
    return props.compareFile?.name ? `配置差异 - ${props.compareFile.name}` : '配置差异';
});

const compareTitle = computed(() => {
    return props.compareFile?.name ? `文件 JSON：${props.compareFile.name}` : '文件 JSON';
});

function closeModal() {
    emit('update:open', false);
}
</script>

<template>
    <section v-if="open" class="diff-page">
        <div class="diff-page-header">
            <a-button type="link" @click="closeModal">
                <ArrowLeftOutlined />
                返回
            </a-button>
            <h3>{{ title }}</h3>
        </div>

        <div class="diff-page-content">
            <JsonDiffView :left="currentConfig" :right="compareConfig" left-title="当前 JSON"
                :right-title="compareTitle" empty-text="两个 JSON 没有差异" />
        </div>
    </section>
</template>

<style scoped>
.diff-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 100%;
    min-width: 0;
}

.diff-page-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 0 12px;
    border-bottom: 1px solid var(--ant-color-split, var(--ant-color-border));
    flex-shrink: 0;
}

.diff-page-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.diff-page-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-top: 12px;
}

.diff-page-content :deep(.json-diff-body) {
    max-height: calc(100vh - 150px);
}
</style>
