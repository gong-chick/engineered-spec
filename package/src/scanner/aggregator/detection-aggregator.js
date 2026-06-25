class DetectionAggregator {
  aggregate(candidates) {
    const sorted = (candidates || [])
      .filter(Boolean)
      .sort((left, right) => {
        if (right.confidence !== left.confidence) {
          return right.confidence - left.confidence;
        }
        return String(left.framework).localeCompare(String(right.framework));
      });

    return {
      primary: sorted[0] || null,
      candidates: sorted,
      tags: [...new Set(sorted.flatMap((item) => item.tags || []))],
      reasons: sorted[0]?.reasons || [],
    };
  }
}

module.exports = {
  DetectionAggregator,
};
