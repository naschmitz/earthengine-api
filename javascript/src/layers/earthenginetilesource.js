goog.module('ee.layers.EarthEngineTileSource');
goog.module.declareLegacyNamespace();

const AbstractTile = goog.require('ee.layers.AbstractTile');
const AbstractTileSource = goog.require('ee.layers.AbstractTileSource');
const PriorityPool = goog.require('goog.structs.PriorityPool');
const data = goog.require('ee.data');
const events = goog.require('goog.events');

/**
 * A layer tile source for tiles served by Earth Engine.
 *
 * @ignore
 * @unrestricted
 */
const EarthEngineTileSource = class extends AbstractTileSource {
  /**
   * @param {!data.RawMapId} mapId The EE map ID for fetching this layer's
   *     tiles.
   * @param {?data.Profiler=} opt_profiler The profiler to send map tile
   *     calculation cost to, if any.
   */
  constructor(mapId, opt_profiler) {
    super();

    /** @const @private {!data.RawMapId} The EE map ID for fetching tiles. */
    this.mapId_ = mapId;

    /**
     * Map tile calculation cost will be sent to this profiler, if its enabled
     * flag is set.
     * @private {?data.Profiler}
     * @const
     */
    this.profiler_ = opt_profiler || null;
  }

  /** @override */
  loadTile(tile, opt_priority) {
    // Enable profiling.
    var ProfilerHeader = data.PROFILE_HEADER.toLowerCase();
    var key =
        events.listen(tile, AbstractTile.EventType.STATUS_CHANGED, function() {
          switch (tile.getStatus()) {
            case AbstractTile.Status.LOADED:
              var profileId = tile.sourceResponseHeaders[ProfilerHeader];
              if (this.profiler_ && profileId) {
                this.profiler_.addTile(tile.div.id, profileId);
              }
              break;
            case AbstractTile.Status.FAILED:
            case AbstractTile.Status.ABORTED:
              if (this.profiler_) {
                if (tile.div.id !== '') {  // Out-of-bounds tiles have no ID.
                  this.profiler_.removeTile(tile.div.id);
                }
              }
              events.unlistenByKey(key);
              break;
            default:
          }
        }, undefined, this);

    // Configure the tile.
    tile.sourceUrl = this.getTileUrl_(tile.coord, tile.zoom);

    // When a request token is available, load the tile.
    const handleAvailableToken = (token) => {
      this.handleAvailableToken_(tile, token);
    };
    const tokenPool = this.getGlobalTokenPool_();
    tokenPool.getObject(handleAvailableToken, opt_priority);
  }

  /** @override */
  getUniqueId() {
    return this.mapId_.mapid + '-' + this.mapId_.token;
  }

  /**
   * Sets the global parallelism for EE tiles.
   *
   * Note that most browsers will also throttle concurrent requests to the same
   * domain, and that each Earth Engine user/project has its own concurrent
   * request quota. This means that the actual parallelism will be the minimum
   * of {this value, the browser's limit, the user and project's quota across
   * clients}.
   *
   * Also note that increasing parallelism doesn't change the latency of
   * individual requests, it just allows more requests to be in flight at once.
   * Said another way, the amount of time per request won't change, but setting
   * a higher parallelism can potentially yield greater overall throughput.
   *
   * @param {number} parallelism The new parallelism limit.
   */
  setGlobalParallelism(parallelism) {
    this.getGlobalTokenPool_().setMaximumCount(parallelism);
  }

  /**
   * Handles a request pool token being available by starting the tile load.
   * @param {AbstractTile} tile The tile to load.
   * @param {!Object} token The EE tile token pool object for this load.
   * @private
   */
  handleAvailableToken_(tile, token) {
    const tokenPool = this.getGlobalTokenPool_();

    // Exit early if the tile was aborted (e.g. because the layer was hidden or
    // this tile was panned out of view).
    if (tile.isDisposed() || tile.getStatus() == AbstractTile.Status.ABORTED) {
      tokenPool.releaseObject(token);
      return;
    }

    var key =
        events.listen(tile, AbstractTile.EventType.STATUS_CHANGED, function() {
          if (tile.isDone()) {
            events.unlistenByKey(key);
            tokenPool.releaseObject(token);
          }
        });

    tile.startLoad();
  }

  /**
   * Returns the EE source URL for the tile at the provided location.
   * @param {!google.maps.Point} coord The position of the tile.
   * @param {number} zoom The zoom level of the tile.
   * @return {string} The tile URL.
   * @private
   */
  getTileUrl_(coord, zoom) {
    const url = data.getTileUrl(this.mapId_, coord.x, coord.y, zoom);
    if (this.profiler_ && this.profiler_.isEnabled()) {
      return url + '&profiling=1';
    }
    return url;
  }

  /**
   * @return {!PriorityPool} The global EE tile request token pool.
   * @private
   */
  getGlobalTokenPool_() {
    if (!EarthEngineTileSource.TOKEN_POOL_) {
      EarthEngineTileSource.TOKEN_POOL_ =
          new PriorityPool(0, EarthEngineTileSource.DEFAULT_TOKEN_COUNT_);
    }
    return EarthEngineTileSource.TOKEN_POOL_;
  }
};
goog.exportSymbol('ee.layers.EarthEngineTileSource', EarthEngineTileSource);

/** @private {?PriorityPool} The global EE tile token pool. */
EarthEngineTileSource.TOKEN_POOL_ = null;

/**
 * @private {number}
 * @const
 * The default global count of outstanding EE tile requests.
 */
EarthEngineTileSource.DEFAULT_TOKEN_COUNT_ = 4;

exports = EarthEngineTileSource;
