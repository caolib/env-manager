import { ref, watch } from 'vue'
import { getData, setData } from '../utils/store'

const ALT_VALUES_KEY = 'env-manager-var-alternatives-v1'

function loadAlternatives() {
    const saved = getData(ALT_VALUES_KEY, null)
    if (saved && typeof saved === 'object') {
        return {
            system: saved.system && typeof saved.system === 'object' ? saved.system : {},
            user: saved.user && typeof saved.user === 'object' ? saved.user : {}
        }
    }
    return { system: {}, user: {} }
}

const alternatives = ref(loadAlternatives())

watch(
    alternatives,
    (newValue) => {
        const serializableValue = JSON.parse(JSON.stringify(newValue))
        setData(ALT_VALUES_KEY, serializableValue)
    },
    { deep: true }
)

export function useAlternativesStore() {
    const normalizeScope = (scope) => (scope === 'system' ? 'system' : 'user')

    const getAlternatives = (scope, name) => {
        const s = normalizeScope(scope)
        const key = (name || '').trim()
        if (!key) return []
        const list = alternatives.value?.[s]?.[key]
        return Array.isArray(list) ? list : []
    }

    const addAlternative = (scope, name, value, note = '') => {
        const s = normalizeScope(scope)
        const key = (name || '').trim()
        if (!key || !value) return

        if (!alternatives.value[s]) alternatives.value[s] = {}
        if (!alternatives.value[s][key]) alternatives.value[s][key] = []

        const list = alternatives.value[s][key]
        const existingIndex = list.findIndex(item => item.value === value)

        if (existingIndex !== -1) {
            // 更新备注
            if (note) list[existingIndex].note = note
            // 移动到最前
            const item = list.splice(existingIndex, 1)[0]
            list.unshift(item)
        } else {
            list.unshift({ value, note, addedAt: Date.now() })
        }

        // 最多保留 20 个
        if (list.length > 20) {
            list.splice(20)
        }
    }

    const removeAlternative = (scope, name, value) => {
        const s = normalizeScope(scope)
        const key = (name || '').trim()
        if (!key || !alternatives.value[s]?.[key]) return

        const list = alternatives.value[s][key]
        const index = list.findIndex(item => item.value === value)
        if (index !== -1) {
            list.splice(index, 1)
        }
    }

    const moveAlternatives = (scope, oldName, newName) => {
        const s = normalizeScope(scope)
        if (alternatives.value[s] && alternatives.value[s][oldName]) {
            alternatives.value[s][newName] = alternatives.value[s][oldName]
            delete alternatives.value[s][oldName]
        }
    }

    return {
        alternatives,
        getAlternatives,
        addAlternative,
        removeAlternative,
        moveAlternatives
    }
}
