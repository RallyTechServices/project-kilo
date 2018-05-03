Ext.define('CArABU.technicalservices.chunk.Store',{

    MAX_CHUNK_SIZE: 50,
    logger: new Rally.technicalservices.Logger(),

    constructor: function(config) {
        this.chunkProperty = config.chunkProperty;
        this.chunkValue = config.chunkValue;

        this.storeConfig = config.storeConfig || {};
        this.storeType = config.storeType || 'Rally.data.wsapi.Store';
        this.filters = config.filters;
    },
    load: function(){
        var deferred = Ext.create('Deft.Deferred');

        var promises = [],
            chunkArray = this.chunkValue,
            config = this.storeConfig;

        for (var i=0; i < chunkArray.length; i = i+this.MAX_CHUNK_SIZE){
            var chunk = Ext.Array.slice(chunkArray, i, i + this.MAX_CHUNK_SIZE);
            promises.push(this._fetchChunk(chunk, config));
        }

        Deft.Promise.all(promises).then({
            success: function(results){
                var records = _.flatten(results);
                this.logger.log('load SUCCESS results', results,records);
                deferred.resolve(records);
            },
            failure: function(msg){
                this.logger.log('load FAILURE', chunkArray, msg);
                deferred.reject(msg);
            },
            scope: this
        });


        return deferred;
    },

    _fetchChunk: function(objectIDs, config){
        this.logger.log('chunk.Store._fetchChunk',objectIDs, config);
        var deferred = Ext.create('Deft.Deferred');

        var chunkProperty = this.chunkProperty,
            filters = _.map(objectIDs, function(o){ return {
                property: chunkProperty,
                value: o
            }
        });
        filters = Rally.data.wsapi.Filter.or(filters);


        if (this.filters){
            if (Ext.isArray(this.filters)){
                this.filters  = Rally.data.wsapi.Filter.and(this.filters);
            }
            filters = filters.and(this.filters);
        }

        this.logger.log('chunk.Store._fetchChunk',filters.toString());

        var fetch = config.fetch || true,
            model = config.model || 'HierarchicalRequirement';

        Ext.create(this.storeType,{
            fetch: fetch,
            filters: filters,
            model: model,
            context: {project: null}
        }).load({
            callback: function(records, operation, success){
                if (success){
                    deferred.resolve(records);
                } else {
                    var msg = "Failure loading records for objectIDs: " + objectIDs.join(', ') + ":  " + operation.error.errors.join(',');
                    deferred.resolve(msg);
                }
            }
        });
        return deferred;
    }

});