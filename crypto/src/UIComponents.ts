import { FinancialCategory, FinancialType } from './types';

export class UIComponents {
    static renderCategoryCustomSelect(
        containerId: string,
        categories: FinancialCategory[],
        types: FinancialType[],
        currentIds: string[] | string | null,
        onSelect: (id: string | string[] | null) => void,
        placeholder = 'Выберите категорию',
        showAllOption = false,
        isMultiSelect = false
    ) {
        const container = document.getElementById(containerId);
        if (!container) return;

        let selectedIds: string[] = [];
        if (Array.isArray(currentIds)) selectedIds = currentIds;
        else if (currentIds) selectedIds = [currentIds];

        const currentOptions = container.querySelector('.custom-options');
        const wasOpen = currentOptions ? currentOptions.classList.contains('open') : false;
        const scrollPos = currentOptions ? currentOptions.scrollTop : 0;

        const groups: Record<string, FinancialCategory[]> = {};
        categories.forEach(c => {
            const type = types.find(t => t.id === c.typeId);
            const typeKey = type ? type.name.toUpperCase() : 'UNKNOWN';
            if (!groups[typeKey]) groups[typeKey] = [];
            groups[typeKey].push(c);
        });

        let triggerText = placeholder;
        if (selectedIds.length === 1) {
            const cat = categories.find(c => c.id === selectedIds[0]);
            if (cat) triggerText = cat.name;
        } else if (selectedIds.length > 1) {
            triggerText = `Выбрано: ${selectedIds.length}`;
        }

        let dropdownHtml = '';
        if (showAllOption) {
            const isAllSelected = selectedIds.length === 0 ? 'selected' : '';
            const check = isAllSelected ? '☑' : '☐';
            dropdownHtml += `<div class="custom-option ${isAllSelected}" data-value="ALL"><span>${check}</span> ${placeholder}</div>`;
        }

        for (const type in groups) {
            let colorClass = 'fin-color-default';
            if (type.includes('ВВОД')) colorClass = 'fin-color-input';
            else if (type.includes('ВЫВОД СРЕДСТВ')) colorClass = 'fin-color-output';
            else if (type.includes('ВЫВОД ПРИБЫЛИ')) colorClass = 'fin-color-profit';

            const cursorStyle = isMultiSelect ? 'cursor: pointer;' : '';
            const titleAttr = isMultiSelect ? 'title="Нажмите, чтобы выбрать/снять всю группу"' : '';
            dropdownHtml += `<div class="custom-group-label ${colorClass}" data-group="${type}" style="${cursorStyle}" ${titleAttr}>${type}</div>`;
            groups[type].forEach(c => {
                const isSelected = selectedIds.includes(c.id) ? 'selected' : '';
                const check = isSelected ? '☑' : '☐';
                dropdownHtml += `<div class="custom-option ${isSelected}" data-value="${c.id}"><span>${check}</span> ${c.name}</div>`;
            });
        }

        container.innerHTML = `
            <div class="custom-select-wrapper">
                <div class="custom-select-trigger">
                    <span>${triggerText}</span>
                </div>
                <div class="custom-options multi-select">
                    ${dropdownHtml}
                </div>
            </div>
        `;

        const trigger = container.querySelector('.custom-select-trigger');
        const optionsContainer = container.querySelector('.custom-options');
        const options = container.querySelectorAll('.custom-option');
        const groupLabels = container.querySelectorAll('.custom-group-label');

        if (trigger && optionsContainer) {
            if (wasOpen) {
                optionsContainer.classList.add('open');
                optionsContainer.scrollTop = scrollPos;
            }

            groupLabels.forEach(label => {
                label.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!isMultiSelect) return;
                    const groupName = (label as HTMLElement).dataset.group;
                    if (!groupName) return;
                    const groupIds: string[] = [];
                    categories.forEach(c => {
                        const typeKey = types.find(t => t.id === c.typeId)?.name.toUpperCase() || 'UNKNOWN';
                        if (typeKey === groupName) groupIds.push(c.id);
                    });
                    const allSelected = groupIds.every(id => selectedIds.includes(id));
                    onSelect(allSelected ? selectedIds.filter(id => !groupIds.includes(id)) : Array.from(new Set([...selectedIds, ...groupIds])));
                });
            });

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.custom-options').forEach(el => {
                    if (el !== optionsContainer) el.classList.remove('open');
                });
                optionsContainer.classList.toggle('open');
            });

            document.addEventListener('click', (e) => {
                if (!trigger.contains(e.target as Node) && !optionsContainer.contains(e.target as Node)) {
                    optionsContainer.classList.remove('open');
                }
            });

            options.forEach(opt => {
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const value = (opt as HTMLElement).dataset.value;
                    if (value) {
                        if (!isMultiSelect) optionsContainer.classList.remove('open');
                        onSelect(value === 'ALL' ? null : value);
                    }
                });
            });
        }
    }
}
