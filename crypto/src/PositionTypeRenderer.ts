import { State } from './types';

/**
 * Редактор списка типов позиций в панели настроек крипто-страницы.
 * Отвечает только за отрисовку блока и передачу действий наружу.
 */
export class PositionTypeRenderer {
    private state: State;
    private onAction: (type: string, payload?: unknown) => void;

    constructor(state: State, onAction: (type: string, payload?: unknown) => void) {
        this.state = state;
        this.onAction = onAction;
    }

    public updateState(state: State) {
        this.state = state;
        this.render();
    }

    // Экранирование значений, попадающих в HTML-атрибуты (названия типов вводит пользователь)
    private static escapeAttr(value: string): string {
        return (value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    public render() {
        const container = document.getElementById('position-types-editor');
        if (!container) return;

        const prevScroll = container.querySelector('.config-table-container')?.scrollTop || 0;

        const rows = this.state.positionTypes.map(t => {
            const usedBy = this.state.assets.filter(a => a.typeId === t.id).length;
            return `
                <tr>
                    <td>
                        <input type="text" class="position-type-name" data-id="${t.id}"
                               value="${PositionTypeRenderer.escapeAttr(t.name)}" style="width: 100%;">
                    </td>
                    <td style="text-align: center; color: var(--text-secondary); font-size: 0.85rem;">${usedBy}</td>
                    <td style="text-align: center;">
                        <button class="delete-btn delete-position-type-btn" data-id="${t.id}" title="Удалить тип">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <div class="config-table-container">
                <table class="config-table">
                    <thead>
                        <tr>
                            <th>Название типа</th>
                            <th width="80" style="text-align: center;">Позиций</th>
                            <th width="40"></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

        const newContainer = container.querySelector('.config-table-container');
        if (newContainer) newContainer.scrollTop = prevScroll;

        this.attachListeners(container);
    }

    private attachListeners(container: HTMLElement) {
        container.querySelectorAll('.position-type-name').forEach(el => {
            el.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const id = target.dataset.id;
                if (!id) return;

                const name = target.value.trim();
                if (!name) {
                    // Возвращаем прежнее название, чтобы не остаться с пустым пунктом в списках
                    const prev = this.state.positionTypes.find(t => t.id === id);
                    target.value = prev ? prev.name : '';
                    alert('Название типа не может быть пустым!');
                    return;
                }
                this.onAction('UPDATE_POSITION_TYPE', { id, name });
            });
        });

        container.querySelectorAll('.delete-position-type-btn').forEach(el => {
            el.addEventListener('click', (e) => {
                const id = ((e.target as HTMLElement).closest('button') as HTMLElement)?.dataset.id;
                if (!id) return;

                const type = this.state.positionTypes.find(t => t.id === id);
                const usedBy = this.state.assets.filter(a => a.typeId === id).length;
                if (usedBy > 0) {
                    alert(`Тип «${type?.name || ''}» используется в ${usedBy} позициях. Сначала смените тип у этих позиций.`);
                    return;
                }
                if (confirm(`Удалить тип «${type?.name || ''}»?`)) {
                    this.onAction('DELETE_POSITION_TYPE', id);
                }
            });
        });
    }
}
