(function (root) {
  function emptyTotals() {
    return {
      projected: 0,
      actual: 0,
      days: Array.from({ length: 7 }, () => ({ projected: 0, actual: 0 })),
    };
  }

  function calculateProductionTotals(records) {
    const result = { red: emptyTotals(), color: emptyTotals(), total: emptyTotals() };
    for (const record of records) {
      const category = String(record.variety || '').trim().toUpperCase() === 'FREEDOM' ? 'red' : 'color';
      for (let index = 0; index < 7; index += 1) {
        const projected = Number(record.days?.[index]?.projected) || 0;
        const actual = Number(record.days?.[index]?.actual) || 0;
        for (const group of [result[category], result.total]) {
          group.days[index].projected += projected;
          group.days[index].actual += actual;
          group.projected += projected;
          group.actual += actual;
        }
      }
    }
    return result;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = calculateProductionTotals;
  else root.calculateProductionTotals = calculateProductionTotals;
})(typeof globalThis !== 'undefined' ? globalThis : this);
