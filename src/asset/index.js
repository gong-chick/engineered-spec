const {
  ASSET_PACKAGE_VERSION,
  ASSET_TYPES,
  ASSET_SOURCES,
  VALID_ASSET_TYPES,
  VALID_ASSET_SOURCES,
  createAssetPackage,
  validateAssetPackage,
  computeAssetChecksum,
  guessAssetType,
  buildAssetIdentity,
} = require('./asset-package');

const { AssetPackageManager } = require('./asset-package-manager');

const { AssetRegistry, createAssetRegistry, ASSET_REGISTRY_STATUSES, VALID_REGISTRY_STATUSES } = require('./asset-registry');
const { AssetVersion, createAssetVersion, compareSemver, bumpVersion } = require('./asset-version');
const { AssetDependency, createAssetDependency } = require('./asset-dependency');
const { AssetInstall, createAssetInstall, INSTALL_STATUSES, VALID_INSTALL_STATUSES } = require('./asset-install');
const { AssetFeedback, createAssetFeedback, FEEDBACK_CATEGORIES, VALID_FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, VALID_FEEDBACK_STATUSES } = require('./asset-feedback');

const { AssetManager, createAssetManager } = require('./asset-manager');

const { AssetInstaller, createAssetInstaller } = require('./asset-installer');

const { AssetLifecycle, createAssetLifecycle } = require('./asset-lifecycle');

const { AssetFork, createAssetFork } = require('./asset-fork');

const { AssetQuality, createAssetQuality } = require('./asset-quality');

module.exports = {
  // asset-package schema
  ASSET_PACKAGE_VERSION,
  ASSET_TYPES,
  ASSET_SOURCES,
  VALID_ASSET_TYPES,
  VALID_ASSET_SOURCES,
  createAssetPackage,
  validateAssetPackage,
  computeAssetChecksum,
  guessAssetType,
  buildAssetIdentity,
  // asset-package-manager
  AssetPackageManager,
  // P5.1 — asset-registry
  AssetRegistry,
  createAssetRegistry,
  ASSET_REGISTRY_STATUSES,
  VALID_REGISTRY_STATUSES,
  // P5.1 — asset-version
  AssetVersion,
  createAssetVersion,
  compareSemver,
  bumpVersion,
  // P5.1 — asset-dependency
  AssetDependency,
  createAssetDependency,
  // P5.1 — asset-install
  AssetInstall,
  createAssetInstall,
  INSTALL_STATUSES,
  VALID_INSTALL_STATUSES,
  // P5.1 — asset-feedback
  AssetFeedback,
  createAssetFeedback,
  FEEDBACK_CATEGORIES,
  VALID_FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  VALID_FEEDBACK_STATUSES,
  // P5.2 — asset-manager
  AssetManager,
  createAssetManager,
  // P5.3 — asset-installer
  AssetInstaller,
  createAssetInstaller,
  // P5.4 — asset-lifecycle
  AssetLifecycle,
  createAssetLifecycle,
  // P5.5 — asset-fork
  AssetFork,
  createAssetFork,
  // P5.6 — asset-quality
  AssetQuality,
  createAssetQuality,
};
