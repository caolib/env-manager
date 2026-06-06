<template>
  <template v-for="(part, index) in parts" :key="index">
    <mark v-if="part.match" class="highlight-text-mark">{{ part.text }}</mark>
    <template v-else>{{ part.text }}</template>
  </template>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  text: {
    type: [String, Number],
    default: ''
  },
  keyword: {
    type: String,
    default: ''
  }
});

const parts = computed(() => getHighlightParts(props.text, props.keyword));

function getHighlightParts(text, keyword) {
  const src = text == null ? '' : String(text);
  const k = keyword == null ? '' : String(keyword);
  if (!src || !k) return [{ text: src, match: false }];

  const srcLower = src.toLowerCase();
  const kLower = k.toLowerCase();
  let i = 0;
  let from = 0;
  const result = [];

  while ((i = srcLower.indexOf(kLower, from)) !== -1) {
    if (i > from) {
      result.push({ text: src.slice(from, i), match: false });
    }
    result.push({ text: src.slice(i, i + k.length), match: true });
    from = i + k.length;
  }

  if (from < src.length) {
    result.push({ text: src.slice(from), match: false });
  }

  return result.length > 0 ? result : [{ text: src, match: false }];
}
</script>

<style scoped>
.highlight-text-mark {
  background-color: yellow;
  color: red;
  padding: 0;
}
</style>
