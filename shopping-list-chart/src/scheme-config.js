
var configSchemes = {

	Scheme1 : {

		seriesLabels : ["AddedAccepted","AddedToDo","Removed","Accepted","ToDo","Capacity","Load"],
		colors : ["#B1CF98","#EEEEEE","#EA2004","#B1CF98","#EEEEEE"],
		
		// returns the summarized data for each series for each day
		// return an object where value is the totaled values, and features
		// contains the set of features used to calculate that value

		categorize : function( bundle, features, dayIndex ) {

			var empty = { value : null, features : [] };
			var toDoX      = this.seriesLabels.indexOf("ToDo");
			var addedToDoX = this.seriesLabels.indexOf("AddedToDo");
			var capacityX  = this.seriesLabels.indexOf("Capacity");
			var loadX      = this.seriesLabels.indexOf("Load");

			// console.log("dayindex",dayIndex,bundle.todayIndex);

			// if date is in future return null array
			if ((bundle.todayIndex!==-1)&&(dayIndex > (bundle.todayIndex+1))) {
				return _.map(this.seriesLabels,function(label){
					return empty;
				});
			}

			// returns true if the feature is in this list
			var featureInList = function(list,feature ) {
				return _.findIndex(list,function(f){
					return f.ObjectID === feature.ObjectID;
				}) !== -1;
			};
			// returns true if feature is in the baseline
			var featureInBaseline = function( feature ) {
				return featureInList( bundle.baseline,feature);
			};

			// returns the value for the feature based on the numeric value of the 
			// preliminary estimate
			var featureValue = function( feature, value ) {
				if (value !== "PreliminaryEstimate") {
					return feature[value];
				} else {
					var reEstimate = feature.RefinedEstimate;
					var peValue = _.find(bundle.prelimEstimateValues,function(v) {
						return feature.PreliminaryEstimate === v.get("ObjectID");
					});
					if (!_.isUndefined(reEstimate) && !_.isNull(reEstimate) && (reEstimate>0)) {
						return reEstimate;
					} else {
						return ( !_.isUndefined(peValue) && !_.isNull(peValue)) ? peValue.get("Value") : 0;
					}
				}
			};

			// sums the specfied value for the set of features
			var reduceFeatures = function(features,value) {
				return _.reduce(features,function(memo,feature){
					return memo + featureValue(feature,value);
				},0);
			};

			var setDataColorValues = function(values) {
				var todo = (values[addedToDoX].value * -1) + 
				values[toDoX].value;
				var capacity = values[capacityX].value;
				var load = ( todo > 0 ? ((capacity/todo)*100) : 0);
				values[loadX] = { value : load,features:[]};

				if (load < 100) {
					values[toDoX].color = "orange";
					values[addedToDoX].color = "orange";
				}
				if (load < 90) {
					values[toDoX].color = "tomato";
					values[addedToDoX].color = "tomato";
				}
			};

			var values = _.map(this.seriesLabels,function(label){

				switch(label) {

					case "AddedAccepted":
						if (bundle.baselineIndex!==-1 && dayIndex >= bundle.baselineIndex) {
							var fts = _.filter(features,function(f){
								return !featureInBaseline(f);
							});
							var value = reduceFeatures( fts,"AcceptedLeafStoryPlanEstimateTotal");
							return { value : value * -1, features : fts };
						} else {
							return empty;
						}
						break;

					case "AddedToDo":
						if (bundle.baselineIndex!==-1 && dayIndex >= bundle.baselineIndex) {
							var fts = _.filter(features,function(f){
								return !featureInBaseline(f);
							});
							var value = _.reduce(fts,function(memo,feature){
								return memo + (feature["LeafStoryPlanEstimateTotal"] - feature["AcceptedLeafStoryPlanEstimateTotal"]);
							},0);
							return { value : value * -1, features : fts }
						} else {
							return empty;
						}
						break;

					case "Removed":
						if (dayIndex < bundle.baselineIndex) {
							return empty;
						} else {
							var fts = _.filter(bundle.baseline,function(f){
								return !featureInList(features,f);
							});
							var x = reduceFeatures(fts,"LeafStoryPlanEstimateTotal")
							return { value : x, features : fts};
						}
						break;

					case "Accepted":
						if (bundle.baselineIndex == -1 || dayIndex < bundle.baselineIndex) {
							// filter to any feature with accepted points > 0
							var fts = _.filter(features,function(f){
								return f["AcceptedLeafStoryPlanEstimateTotal"] > 0;
							})
							var value = reduceFeatures(features,"AcceptedLeafStoryPlanEstimateTotal");
							return { value : value, features : fts};
						} else {
							var fts = _.filter(features,function(f) {
								return featureInBaseline(f);
							});
							var value =  reduceFeatures( fts,"AcceptedLeafStoryPlanEstimateTotal");
							return { value : value, features : fts};
						}
						break;

					case "ToDo":
						if (bundle.baselineIndex == -1 || dayIndex < bundle.baselineIndex) {
							var value = reduceFeatures(features,"PreliminaryEstimate")
							return { value : value, features : features }
						} else {
							var fts = _.filter(features,function(f){
								return featureInBaseline(f);
							});
							var value = _.reduce( fts, function(memo,feature) {
								return memo +(feature["LeafStoryPlanEstimateTotal"] - feature["AcceptedLeafStoryPlanEstimateTotal"]);
							}, 0 );
							return { value : value , features : fts };
						}
						break;

					case "Capacity":
						var totalCapacity = _.reduce(bundle.releases,function(memo,release) {
							var pv = release.get("PlannedVelocity");
							pv = (!_.isNull(pv) ? pv : 0);
							return memo + pv;
						},0);
						var days = bundle.data.length;
						var value = (totalCapacity / days) * (days - dayIndex);
						return { value : value, features : [] };
						break;
					case "Load":
						return empty; // fill this in after
						break;
				}
			});
		
			// "but we would like to “turn in around” so that the percentage shows 
			// how much of the remaining ToDo you can deliver with your capacity – 
			// and not how much you’re loaded."
			setDataColorValues(values);
			// console.log("values",_.map(values,function(v){return v.value}));

			return values;
		}
	}
}
