var _loadAStoreWithAPromise = function( model_name, model_fields, filters,ctx,order) {

	var deferred = Ext.create('Deft.Deferred');
	var me = this;

	var config = {
		model: model_name,
		fetch: model_fields,
		filters: filters,
		limit: 'Infinity'
	};
	if (!_.isUndefined(ctx)&&!_.isNull(ctx)) {
		config.context = ctx;
	}
	if (!_.isUndefined(order)&&!_.isNull(order)) {
		config.order = order;
	}

	Ext.create('Rally.data.wsapi.Store', config ).load({
		callback : function(records, operation, successful) {
			if (successful){
				deferred.resolve(records);
			} else {
				deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
			}
		}
	});
	return deferred.promise;
};

var createIterationCapacityFilter = function(iterations) {
	var filter = null;
	_.each( iterations, function( iteration, x ) {
		var f = Ext.create('Rally.data.wsapi.Filter', {
				property : 'Iteration', operator : '=', value : iteration.get("_ref") }
		);
		filter = (x===0) ? f : filter.or(f);
	});
	console.log("Capacity Filter:",filter.toString());
	return filter;
};


