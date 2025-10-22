import { useLayoutEffect, useRef, useState, DependencyList } from 'react';

interface CellConfig {
  element: HTMLElement;
  lineClamp: number;
  maxHeight: number;
}

interface CellTextData {
  element: HTMLElement;
  content: HTMLElement;
  naturalLines: number;
  lineHeight: number;
  cellPadding: number;
}

interface RowTextData {
  cells: CellTextData[];
  maxNaturalLines: number;
  minLines: number; // минимум строк для этого ряда
}

interface UseGridWithLineClampReturn {
  gridRef: React.RefObject<HTMLDivElement>;
  isCalculated: boolean;
}

function useGridWithLineClamp(dependencies: DependencyList = []): UseGridWithLineClampReturn {
  const gridRef = useRef<HTMLDivElement>(null);
  const [isCalculated, setIsCalculated] = useState<boolean>(false);
  const [cellConfigs, setCellConfigs] = useState<CellConfig[]>([]);

  useLayoutEffect(() => {
    if (!gridRef.current) return;

    const calculateGridWithLineClamp = (): void => {
      const container = gridRef.current;
      if (!container) return;

      const gridItems = Array.from(container.children) as HTMLElement[];

      // Сбрасываем все ограничения для измерения
      gridItems.forEach((item: HTMLElement) => {
        const content = item.querySelector('#markdownContent') as HTMLElement;
        if (content) {
          content.style.webkitLineClamp = 'unset';
          content.style.maxHeight = 'none';
          content.style.overflow = 'visible';
          content.style.display = 'block';
        }
      });

      // Группируем по строкам (по 2 в строке)
      const rows: HTMLElement[][] = [];
      for (let i = 0; i < gridItems.length; i += 2) {
        rows.push(gridItems.slice(i, i + 2));
      }

      // Анализируем текст в каждой ячейке
      const rowTextData: RowTextData[] = rows.map((rowItems: HTMLElement[]) => {
        const cellData: CellTextData[] = rowItems.map((item: HTMLElement) => {
          const content = item.querySelector('#markdownContent') as HTMLElement;
          if (!content) {
            throw new Error('markdown-content element not found');
          }

          const lineHeight = getLineHeight(content);
          const cellPadding = getCellPadding(item);

          // Измеряем количество строк в естественном состоянии
          const naturalHeight = content.scrollHeight;
          const naturalLines = Math.ceil(naturalHeight / lineHeight);

          return {
            element: item,
            content,
            naturalLines,
            lineHeight,
            cellPadding
          };
        });

        const maxNaturalLines = Math.max(...cellData.map(c => c.naturalLines));
        const avgLineHeight = cellData.reduce((sum, c) => sum + c.lineHeight, 0) / cellData.length;
        const avgPadding = cellData.reduce((sum, c) => sum + c.cellPadding, 0) / cellData.length;

        // Минимальные строки для ряда (минимум 160px высота)
        const minLines = Math.max(1, Math.ceil((160 - avgPadding) / avgLineHeight));

        return {
          cells: cellData,
          maxNaturalLines,
          minLines
        };
      });

      // Рассчитываем оптимальное распределение строк между рядами
      const optimalRowLines = calculateOptimalLineDistribution(rowTextData, 740);

      // Вычисляем конфигурацию для каждой ячейки
      const configs: CellConfig[] = [];
      const actualRowHeights: number[] = [];

      rowTextData.forEach((row: RowTextData, rowIndex: number) => {
        const allocatedLines = optimalRowLines[rowIndex];
        let maxActualHeight = 0;

        row.cells.forEach((cell: CellTextData) => {
          const { content, naturalLines, lineHeight, cellPadding } = cell;

          // Ограничиваем количество строк выделенным для ряда
          const clampLines = Math.min(allocatedLines, naturalLines);
          const textHeight = clampLines * lineHeight;
          const cellHeight = textHeight + cellPadding;

          maxActualHeight = Math.max(maxActualHeight, cellHeight);

          configs.push({
            element: content,
            lineClamp: clampLines,
            maxHeight: textHeight
          });
        });

        actualRowHeights.push(maxActualHeight);
      });

      // Применяем вычисленные размеры к гриду
      const gridTemplateRows = actualRowHeights.map((h: number) => `${h}px`).join(' ');
      container.style.gridTemplateRows = gridTemplateRows;
      container.style.height = '740px';

      setCellConfigs(configs);
      setIsCalculated(true);
    };

    const timer = setTimeout(calculateGridWithLineClamp, 0);
    return () => clearTimeout(timer);
  }, dependencies);

  // Применяем line-clamp после расчета
  useLayoutEffect(() => {
    if (isCalculated && cellConfigs.length > 0) {
      cellConfigs.forEach((config: CellConfig) => {
        const { element, lineClamp, maxHeight } = config;
        element.style.webkitLineClamp = lineClamp.toString();
        element.style.maxHeight = `${maxHeight}px`;
        element.style.overflow = 'hidden';
        element.style.display = '-webkit-box';
        element.style.webkitBoxOrient = 'vertical';
      });
    }
  }, [isCalculated, cellConfigs]);

  return { gridRef, isCalculated };
}

// Ключевая функция - распределение строк между рядами
function calculateOptimalLineDistribution(
  rowTextData: RowTextData[],
  maxTotalHeight: number
): number[] {
  const rowCount = rowTextData.length;

  // Вычисляем идеальное количество строк для каждого ряда (без ограничений по высоте)
  const idealAllocation = rowTextData.map(row =>
    Math.max(row.maxNaturalLines, row.minLines)
  );

  // Проверяем, помещается ли идеальное распределение
  const getCurrentHeight = (allocation: number[]): number => {
    return allocation.reduce((sum, lines, index) => {
      const rowAvgLineHeight = rowTextData[index].cells.reduce((s, c) => s + c.lineHeight, 0) / rowTextData[index].cells.length;
      const rowAvgPadding = rowTextData[index].cells.reduce((s, c) => s + c.cellPadding, 0) / rowTextData[index].cells.length;
      return sum + (lines * rowAvgLineHeight) + rowAvgPadding;
    }, 0);
  };

  const idealHeight = getCurrentHeight(idealAllocation);

  // Если идеальное распределение помещается, используем его
  if (idealHeight <= maxTotalHeight) {
    return idealAllocation;
  }

  // Если не помещается, начинаем с минимума и добавляем строки по приоритету
  let currentAllocation = rowTextData.map(row => row.minLines);
  let currentHeight = getCurrentHeight(currentAllocation);

  // Создаем список рядов, отсортированный по приоритету (больше контента = выше приоритет)
  const rowPriorities = rowTextData
    .map((row, index) => ({
      index,
      remainingNeed: Math.max(0, row.maxNaturalLines - row.minLines),
      priority: row.maxNaturalLines - row.minLines // чем больше нужно, тем выше приоритет
    }))
    .filter(item => item.remainingNeed > 0)
    .sort((a, b) => b.priority - a.priority);

  // Распределяем оставшиеся строки по приоритету
  let priorityIndex = 0;
  let iterations = 0;
  const maxIterations = 200;

  while (currentHeight < maxTotalHeight && priorityIndex < rowPriorities.length && iterations < maxIterations) {
    const currentPriorityItem = rowPriorities[priorityIndex];
    const rowIndex = currentPriorityItem.index;
    const row = rowTextData[rowIndex];

    // Если этому ряду уже дали все необходимые строки, переходим к следующему
    if (currentAllocation[rowIndex] >= row.maxNaturalLines) {
      priorityIndex++;
      continue;
    }

    // Пробуем добавить одну строку
    const testAllocation = [...currentAllocation];
    testAllocation[rowIndex]++;

    const testHeight = getCurrentHeight(testAllocation);
    if (testHeight <= maxTotalHeight) {
      currentAllocation = testAllocation;
      currentHeight = testHeight;

      // Если этому ряду больше не нужно строк, переходим к следующему
      if (currentAllocation[rowIndex] >= row.maxNaturalLines) {
        priorityIndex++;
      }
    } else {
      // Если текущему ряду не хватает места, переходим к следующему
      priorityIndex++;
    }

    // Если дошли до конца списка, начинаем сначала (для случаев, когда есть свободное место)
    if (priorityIndex >= rowPriorities.length) {
      priorityIndex = 0;
      // Но только если есть ряды, которым еще нужны строки
      const hasNeedyRows = rowPriorities.some(item =>
        currentAllocation[item.index] < rowTextData[item.index].maxNaturalLines
      );
      if (!hasNeedyRows) break;
    }

    iterations++;
  }

  return currentAllocation;
}

// Вспомогательные функции (без изменений)
function getLineHeight(element: HTMLElement): number {
  const computedStyle = window.getComputedStyle(element);
  let lineHeight = parseFloat(computedStyle.lineHeight);

  if (isNaN(lineHeight) || computedStyle.lineHeight === 'normal') {
    const temp = document.createElement('div');
    temp.style.position = 'absolute';
    temp.style.visibility = 'hidden';
    temp.style.height = 'auto';
    temp.style.width = 'auto';
    temp.style.fontSize = computedStyle.fontSize;
    temp.style.fontFamily = computedStyle.fontFamily;
    temp.style.lineHeight = computedStyle.lineHeight;
    temp.textContent = 'M';

    document.body.appendChild(temp);
    lineHeight = temp.offsetHeight;
    document.body.removeChild(temp);
  }

  return lineHeight;
}

function getCellPadding(cellElement: HTMLElement): number {
  const computedStyle = window.getComputedStyle(cellElement);
  const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
  const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
  const marginTop = parseFloat(computedStyle.marginTop) || 0;
  const marginBottom = parseFloat(computedStyle.marginBottom) || 0;

  return paddingTop + paddingBottom + marginTop + marginBottom;
}

export { useGridWithLineClamp, type UseGridWithLineClampReturn };
