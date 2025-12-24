import { ref, computed, watch } from 'vue'
import { getData, setData } from '../utils/store'

// 存储键名
const GROUPS_KEY = 'env-manager-variable-groups'

// 从 dbStorage 加载变量组
const loadGroups = () => {
    const saved = getData(GROUPS_KEY, [])
    return saved
}

// 全局状态
const groups = ref(loadGroups())

// 监听变化并持久化
watch(
    groups,
    (newValue) => {
        const serializableValue = JSON.parse(JSON.stringify(newValue))
        setData(GROUPS_KEY, serializableValue)
    },
    { deep: true }
)

/**
 * groups store
 */
export function useGroupsStore() {
    const allGroups = computed(() => groups.value)

    const addGroup = (group) => {
        groups.value.push({
            id: Date.now().toString(),
            name: group.name,
            scope: group.scope || 'user',
            variables: group.variables || [],
            schemes: group.schemes || [],
            activeSchemeId: null,
            ...group
        })
    }

    const updateGroup = (id, updatedGroup) => {
        const index = groups.value.findIndex(g => g.id === id)
        if (index !== -1) {
            groups.value[index] = { ...groups.value[index], ...updatedGroup }
        }
    }

    const deleteGroup = (id) => {
        const index = groups.value.findIndex(g => g.id === id)
        if (index !== -1) {
            groups.value.splice(index, 1)
        }
    }

    const addScheme = (groupId, scheme) => {
        const group = groups.value.find(g => g.id === groupId)
        if (group) {
            group.schemes.push({
                id: Date.now().toString(),
                name: scheme.name,
                values: scheme.values || {}
            })
        }
    }

    const updateScheme = (groupId, schemeId, updatedScheme) => {
        const group = groups.value.find(g => g.id === groupId)
        if (group) {
            const index = group.schemes.findIndex(s => s.id === schemeId)
            if (index !== -1) {
                group.schemes[index] = { ...group.schemes[index], ...updatedScheme }
            }
        }
    }

    const deleteScheme = (groupId, schemeId) => {
        const group = groups.value.find(g => g.id === groupId)
        if (group) {
            const index = group.schemes.findIndex(s => s.id === schemeId)
            if (index !== -1) {
                group.schemes.splice(index, 1)
                if (group.activeSchemeId === schemeId) {
                    group.activeSchemeId = null
                }
            }
        }
    }

    const reload = () => {
        groups.value = loadGroups()
    }

    return {
        groups: allGroups,
        addGroup,
        updateGroup,
        deleteGroup,
        addScheme,
        updateScheme,
        deleteScheme,
        reload
    }
}
