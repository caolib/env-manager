import { ref, watch } from 'vue'
import { getData, setData } from '../utils/store'

const ALT_VALUES_KEY = 'env-manager-var-alternatives-v1'
const OLD_ALT_VALUES_KEY = 'env-manager-alternatives' // 兼容旧版本

function loadAlternatives() {
    // 先尝试加载新版本的数据
    let saved = getData(ALT_VALUES_KEY, null)
    
    // 如果新版本没有数据，尝试加载旧版本的数据
    if (!saved) {
        saved = getData(OLD_ALT_VALUES_KEY, null)
        // 如果找到旧版本数据，迁移到新版本 key
        if (saved) {
            setData(ALT_VALUES_KEY, saved)
        }
    }
    
    if (saved && typeof saved === 'object') {
        // 确保数据结构完整
        const result = {
            system: {},
            user: {}
        }
        
        // 迁移 system 范围的数据
        if (saved.system && typeof saved.system === 'object') {
            Object.keys(saved.system).forEach(key => {
                const value = saved.system[key]
                // 确保每个变量名对应的值是数组
                if (Array.isArray(value)) {
                    result.system[key] = value.map(item => {
                        // 确保每个备用值都是对象，包含 value 属性
                        if (typeof item === 'string') {
                            return { value: item, note: '' }
                        }
                        return typeof item === 'object' && item.value ? item : { value: String(item), note: '' }
                    })
                }
            })
        }
        
        // 迁移 user 范围的数据
        if (saved.user && typeof saved.user === 'object') {
            Object.keys(saved.user).forEach(key => {
                const value = saved.user[key]
                if (Array.isArray(value)) {
                    result.user[key] = value.map(item => {
                        if (typeof item === 'string') {
                            return { value: item, note: '' }
                        }
                        return typeof item === 'object' && item.value ? item : { value: String(item), note: '' }
                    })
                }
            })
        }
        
        return result
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

    const removeAllAlternatives = (scope, name) => {
        const s = normalizeScope(scope)
        const key = (name || '').trim()
        if (alternatives.value[s] && alternatives.value[s][key]) {
            delete alternatives.value[s][key]
        }
    }

    const setAlternatives = (scope, name, list) => {
        const s = normalizeScope(scope)
        const key = (name || '').trim()
        if (!key) return
        if (!alternatives.value[s]) alternatives.value[s] = {}
        
        if (Array.isArray(list) && list.length > 0) {
            // 确保列表中的每一项都有 value 属性
            const validList = list.map(item => {
                if (typeof item === 'string') {
                    return { value: item, note: '' }
                }
                return typeof item === 'object' && item.value ? item : { value: String(item), note: '' }
            })
            alternatives.value[s][key] = validList
        } else {
            delete alternatives.value[s][key]
        }
    }

    const reloadAlternatives = () => {
        alternatives.value = loadAlternatives()
    }

    return {
        alternatives,
        getAlternatives,
        addAlternative,
        removeAlternative,
        moveAlternatives,
        removeAllAlternatives,
        setAlternatives,
        reloadAlternatives
    }
}
