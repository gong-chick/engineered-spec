const { DetectionAggregator } = require('../aggregator/detection-aggregator');
const { NextJsDetector } = require('./nextjs-detector');
const { ReactViteDetector } = require('./react-vite-detector');
const { ReactWebpackDetector } = require('./react-webpack-detector');
const { VueViteDetector } = require('./vue-vite-detector');
const { SpringBootDetector } = require('./springboot-detector');
const { SpringMvcDetector } = require('./springmvc-detector');
const { SpringCloudDetector } = require('./springcloud-detector');
const { FastApiDetector } = require('./fastapi-detector');
const { GoDetector } = require('./go-detector');
const { NestJsDetector } = require('./nestjs-detector');

class DetectorRegistry {
  constructor(detectors) {
    this.detectors = detectors || [
      new NextJsDetector(),
      new ReactViteDetector(),
      new ReactWebpackDetector(),
      new VueViteDetector(),
      new SpringCloudDetector(),
      new SpringBootDetector(),
      new SpringMvcDetector(),
      new NestJsDetector(),
      new FastApiDetector(),
      new GoDetector(),
    ];
    this.aggregator = new DetectionAggregator();
  }

  detect(facts) {
    const candidates = [];
    for (const detector of this.detectors) {
      const result = detector.detect(facts);
      if (result) {
        candidates.push(result);
      }
    }
    return this.aggregator.aggregate(candidates);
  }
}

module.exports = {
  DetectorRegistry,
};
