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

var workingDaysBetweenDates = function(startDate, endDate) {
  
    // Validate input
    if (endDate < startDate)
        return 0;
    
    // Calculate days between dates
    var millisecondsPerDay = 86400 * 1000; // Day in milliseconds
    startDate.setHours(0,0,0,1);  // Start just after midnight
    endDate.setHours(23,59,59,999);  // End just before midnight
    var diff = endDate - startDate;  // Milliseconds between datetime objects    
    var days = Math.ceil(diff / millisecondsPerDay);
    
    // Subtract two weekend days for every week in between
    var weeks = Math.floor(days / 7);
    days = days - (weeks * 2);

    // Handle special cases
    var startDay = startDate.getDay();
    var endDay = endDate.getDay();
    
    // Remove weekend not previously removed.   
    if (startDay - endDay > 1)         
        days = days - 2;      
    
    // Remove start day if span starts on Sunday but ends before Saturday
    if (startDay == 0 && endDay != 6)
        days = days - 1  
            
    // Remove end day if span ends on Saturday but starts after Sunday
    if (endDay == 6 && startDay != 0)
        days = days - 1  
    
    return days;
}


