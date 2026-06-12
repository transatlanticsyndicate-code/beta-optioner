import { State } from './types';
import { StatsRenderer } from './StatsRenderer';
import { TableRenderer } from './TableRenderer';
import { ScenarioRenderer } from './ScenarioRenderer';

import { FinancialRenderer } from './FinancialRenderer';
import { WeeklyStatsRenderer } from './WeeklyStatsRenderer';

/**
 * Класс UI управляет отрисовкой интерфейса, делегируя задачи под-рендерерам.
 * Также обрабатывает глобальные пользовательские события.
 */
export class UI {
    private state: State;
    private onAction: (type: string, payload?: unknown) => void;

    // Sub-renderers
    private statsRenderer: StatsRenderer;
    private tableRenderer: TableRenderer;
    private scenarioRenderer: ScenarioRenderer;

    private financialRenderer: FinancialRenderer;
    private weeklyStatsRenderer: WeeklyStatsRenderer;

    /**
     * @param state Текущее состояние приложения
     * @param onAction Координатор действий, направляемых в Store
     */
    constructor(state: State, onAction: (type: string, payload?: unknown) => void) {
        this.state = state;
        this.onAction = onAction;

        // Initialize sub-renderers
        this.statsRenderer = new StatsRenderer(state, onAction);
        this.tableRenderer = new TableRenderer(state, onAction);
        this.scenarioRenderer = new ScenarioRenderer(state, onAction);

        this.financialRenderer = new FinancialRenderer(state, onAction);
        this.weeklyStatsRenderer = new WeeklyStatsRenderer(state, onAction);
    }

    /**
     * Обновляет локальную копию состояния и инициирует перерисовку.
     */
    updateState(newState: State) {
        this.state = newState;
        this.statsRenderer.updateState(newState);
        this.tableRenderer.updateState(newState);
        this.scenarioRenderer.updateState(newState);

        this.financialRenderer.updateState(newState);
        this.weeklyStatsRenderer.updateState(newState);

        const cmcKeyInput = document.getElementById('cmc-api-key') as HTMLInputElement;
        if (cmcKeyInput && document.activeElement !== cmcKeyInput) {
            cmcKeyInput.value = newState.cmcApiKey || '';
        }

        this.render();
    }

    setSearchQuery(query: string) {
        this.tableRenderer.setSearchQuery(query);
    }

    /**
     * Обновляет индикатор синхронизации с базой в шапке.
     * ЗАЧЕМ: делает видимым сбой сохранения (раньше он был молчаливым).
     */
    setSyncStatus(status: 'saving' | 'saved' | 'error') {
        const el = document.getElementById('sync-status');
        if (!el) return;
        const map = {
            saving: { text: '⟳ Сохранение…', color: 'var(--text-secondary, #888)', title: 'Идёт сохранение в базу' },
            saved: { text: '✓ Сохранено', color: '#22c55e', title: 'Данные сохранены в базе' },
            error: { text: '⚠ Не сохранено', color: '#ef4444', title: 'Данные НЕ сохранились в базу — проверьте вход и соединение' },
        };
        const v = map[status] || map.saved;
        el.textContent = v.text;
        el.style.color = v.color;
        el.setAttribute('title', v.title);
    }

    /**
     * Выполняет полную перерисовку компонентов, которые не обновляются внутри sub-renderers автономно.
     */
    render() {
        this.statsRenderer.render();
        // this.tableRenderer.render(); // Handled by updateState / dedicated calls. Avoiding double render.
        this.scenarioRenderer.render();

        this.financialRenderer.render();
        this.weeklyStatsRenderer.render();
        this.updateScenarioDropdowns();
        this.renderLogo();
    }

    private renderLogo() {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const isFinancial = document.getElementById('view-financial-accounting')?.style.display !== 'none';
        const isWeekly = document.getElementById('view-weekly-stats')?.style.display !== 'none';

        // App Logo (Crypto Manager)
        const logo = document.getElementById('app-logo') as HTMLImageElement;
        if (logo) {
            logo.src = isDark ? '/cryptoB.png' : '/cryptoW.png';
        }

        // Financial Logo
        const finLogo = document.getElementById('fin-app-logo') as HTMLImageElement;
        if (finLogo) {
            finLogo.src = isDark ? '/finB.png' : '/finW.png';
        }

        // Weekly Logo (Same as Fin for now)
        const weeklyLogo = document.getElementById('weekly-app-logo') as HTMLImageElement;
        if (weeklyLogo) {
            weeklyLogo.src = isDark ? '/finB.png' : '/finW.png';
        }

        // Favicon and Title
        const favicon = document.querySelector('link[rel~="icon"]') as HTMLLinkElement;
        if (isFinancial) {
            if (favicon) favicon.href = isDark ? '/finB.png' : '/finW.png';
            document.title = 'Финансовый учет';
        } else if (isWeekly) {
            if (favicon) favicon.href = isDark ? '/finB.png' : '/finW.png';
            document.title = 'Еженедельная статистика';
        } else {
            if (favicon) favicon.href = isDark ? '/cryptoB.png' : '/cryptoW.png';
            document.title = 'Крипто Менеджер';
        }
    }

    /**
     * Инициализирует слушатели для глобальных элементов интерфейса (шапка, настройки).
     * Должен быть вызван один раз при старте.
     */
    attachGlobalListeners() {
        // --- Add Asset ---
        const nameInput = document.getElementById('new-asset-name') as HTMLInputElement;
        const addBtn = document.getElementById('add-asset-btn') as HTMLButtonElement;
        const scenarioSelect = document.getElementById('new-asset-scenario') as HTMLSelectElement;

        const updateAddBtnState = () => {
            if (addBtn && nameInput && scenarioSelect) {
                const hasName = nameInput.value.trim().length > 0;
                const hasScenario = scenarioSelect.value !== "";
                addBtn.disabled = !(hasName && hasScenario);
            }
        };

        if (nameInput) {
            updateAddBtnState();
            nameInput.addEventListener('input', () => {
                nameInput.value = nameInput.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                updateAddBtnState();
            });
        }

        if (scenarioSelect) {
            scenarioSelect.addEventListener('change', updateAddBtnState);
        }

        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const ticker = nameInput.value.trim().toUpperCase();
                const scenarioId = parseInt(scenarioSelect.value);

                if (!ticker || isNaN(scenarioId)) return;

                // Check duplicates in local state copy
                if (this.state.assets.some(a => a.name === ticker)) {
                    alert(`Тикер ${ticker} уже есть в списке!`);
                    return;
                }

                this.onAction('ADD_ASSET', { name: ticker, scenario: scenarioId });

                nameInput.value = '';
                scenarioSelect.value = "";
                updateAddBtnState();
            });
        }

        // --- Search ---
        const searchInput = document.getElementById('search-asset-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
                searchInput.value = query;
                this.setSearchQuery(query);
            });
        }

        document.getElementById('clear-search-btn')?.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                this.setSearchQuery('');
            }
            const filterScenarioSelect = document.getElementById('filter-asset-scenario') as HTMLSelectElement;
            if (filterScenarioSelect) {
                filterScenarioSelect.value = '';
                this.tableRenderer.setFilterScenario(null);
            }
            if (searchInput) searchInput.focus();
        });

        // --- Filter Scenario ---
        const filterScenarioSelect = document.getElementById('filter-asset-scenario') as HTMLSelectElement;
        if (filterScenarioSelect) {
            filterScenarioSelect.addEventListener('change', () => {
                const val = filterScenarioSelect.value;
                this.tableRenderer.setFilterScenario(val === '' ? null : parseInt(val));
            });
        }

        // --- Theme ---
        document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
            this.onAction('TOGGLE_THEME');
        });

        // --- Settings Panel Toggle ---
        document.getElementById('toggle-settings-btn')?.addEventListener('click', () => {
            const panel = document.getElementById('settings-panel');
            if (panel) panel.classList.toggle('open');
        });

        // --- Settings Actions ---
        document.getElementById('reset-config-btn')?.addEventListener('click', () => {
            if (confirm('Сбросить настройки сценариев?')) {
                this.onAction('RESET_CONFIG');
            }
        });

        document.getElementById('add-scenario-btn')?.addEventListener('click', () => {
            const name = prompt('Введите название сценария (число):');
            if (!name) return;
            const key = parseInt(name);
            if (isNaN(key)) {
                alert('Должно быть числом!');
                return;
            }
            // Basic validation check against local state
            if (this.state.config.scenarios[key]) {
                alert('Уже существует!');
                return;
            }
            this.onAction('ADD_SCENARIO', key);
        });

        document.getElementById('export-data-btn')?.addEventListener('click', () => {
            this.onAction('EXPORT_DATA');
        });

        document.getElementById('import-data-btn')?.addEventListener('click', () => {
            this.triggerImport();
        });

        document.getElementById('full-reset-btn')?.addEventListener('click', () => {
            if (confirm('СБРОСИТЬ ВСЕ ДАННЫЕ?')) {
                this.onAction('FULL_RESET');
            }
        });

        // --- CMC Rankings ---
        const cmcKeyInput = document.getElementById('cmc-api-key') as HTMLInputElement;
        const updateRankBtn = document.getElementById('update-rankings-btn') as HTMLButtonElement;

        if (cmcKeyInput) {
            cmcKeyInput.value = this.state.cmcApiKey || '';
            cmcKeyInput.addEventListener('change', () => {
                this.onAction('UPDATE_CMC_KEY', cmcKeyInput.value.trim());
            });
        }

        if (updateRankBtn) {
            updateRankBtn.addEventListener('click', () => {
                this.onAction('UPDATE_RANKINGS_FORCE');
            });
        }

        // --- Navigation ---
        const navButtons = document.querySelectorAll('.nav-btn');
        const viewCrypto = document.getElementById('view-crypto-manager');
        const viewFin = document.getElementById('view-financial-accounting');
        const viewWeekly = document.getElementById('view-weekly-stats');

        const switchView = (targetText: string, updateHash = true) => {
            navButtons.forEach(b => {
                if (b.textContent?.trim() === targetText) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });

            if (targetText.includes('Крипто')) {
                if (viewCrypto) viewCrypto.style.display = 'flex';
                if (viewFin) viewFin.style.display = 'none';
                if (viewWeekly) viewWeekly.style.display = 'none';
                localStorage.setItem('activeView', 'crypto');
                if (updateHash) window.location.hash = 'crypto';
            } else if (targetText.includes('Финансовый')) {
                if (viewCrypto) viewCrypto.style.display = 'none';
                if (viewFin) viewFin.style.display = 'flex';
                if (viewWeekly) viewWeekly.style.display = 'none';
                localStorage.setItem('activeView', 'financial');
                if (updateHash) window.location.hash = 'financial';
                this.financialRenderer.resetAutoScroll();
                this.financialRenderer.render();
            } else if (targetText.includes('Еженедельная')) {
                if (viewCrypto) viewCrypto.style.display = 'none';
                if (viewFin) viewFin.style.display = 'none';
                if (viewWeekly) viewWeekly.style.display = 'flex';
                localStorage.setItem('activeView', 'weekly');
                if (updateHash) window.location.hash = 'weekly';
                this.weeklyStatsRenderer.resetAutoScroll();
                this.weeklyStatsRenderer.render();
            }
            this.renderLogo();
        };

        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                switchView(btn.textContent?.trim() || '');
            });
        });

        // Handle hash changes (back/forward history or manual URL change)
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.substring(1); // remove #
            if (hash === 'financial') {
                switchView('Финансовый учет', false);
            } else if (hash === 'weekly') {
                switchView('Еженедельная статистика', false);
            } else {
                switchView('Крипто Менеджер', false);
            }
        });

        // Initial Load Strategy:
        // 1. Check Hash first (if user clicked a specific link)
        // 2. Check LocalStorage (restore last session)
        // 3. Default to Crypto Manager
        const hash = window.location.hash.substring(1);
        if (hash === 'financial') {
            switchView('Финансовый учет', false);
        } else if (hash === 'weekly') {
            switchView('Еженедельная статистика', false);
        } else if (hash === 'crypto') {
            switchView('Крипто Менеджер', false);
        } else {
            // No hash, check storage
            const savedView = localStorage.getItem('activeView');
            if (savedView === 'financial') {
                switchView('Финансовый учет');
            } else if (savedView === 'weekly') {
                switchView('Еженедельная статистика');
            } else {
                switchView('Крипто Менеджер');
            }
        }

        // --- Financial Accounting Listeners ---
        document.getElementById('fin-toggle-settings-btn')?.addEventListener('click', () => {
            const panel = document.getElementById('fin-settings-panel');
            if (panel) panel.classList.toggle('open');
        });

        document.getElementById('weekly-toggle-settings-btn')?.addEventListener('click', () => {
            const panel = document.getElementById('weekly-settings-panel');
            if (panel) panel.classList.toggle('open');
        });
    }

    private triggerImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string);
                    if (data && data.assets && data.config) {
                        if (confirm('Заменить текущие данные?')) {
                            this.onAction('IMPORT_STATE', data);
                        }
                    } else {
                        alert('Неверный формат файла!');
                    }
                } catch (err) { alert('Ошибка чтения файла!'); }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    private updateScenarioDropdowns() {
        // 1. New Asset Dropdown
        const addSelect = document.getElementById('new-asset-scenario') as HTMLSelectElement;
        if (addSelect) {
            const currentValue = addSelect.value;
            const scenarios = Object.keys(this.state.config.scenarios).map(k => parseInt(k)).sort((a, b) => a - b);

            const options = scenarios.map(s => `
                <option value="${s}" ${currentValue === s.toString() ? 'selected' : ''}>${s}</option>
            `).join('');

            addSelect.innerHTML = `<option value="" disabled ${currentValue === "" ? 'selected' : ''} hidden>Сценарий</option>` + options;
        }

        // 2. Filter Dropdown
        const filterSelect = document.getElementById('filter-asset-scenario') as HTMLSelectElement;
        if (filterSelect) {
            const currentValue = filterSelect.value;
            // Get scenarios again (could optimize, but safe)
            const scenarios = Object.keys(this.state.config.scenarios).map(k => parseInt(k)).sort((a, b) => a - b);

            // "All" option + scenarios
            const options = scenarios.map(s => `
                <option value="${s}" ${currentValue === s.toString() ? 'selected' : ''}>${s}</option>
            `).join('');

            filterSelect.innerHTML = `<option value="" ${currentValue === "" ? 'selected' : ''}>По сценарию</option>` + options;
        }
    }
}
