Ext.override(Rally.data.wsapi.TreeStore,{
    _decorateModels: function() {
        var models = this.model;

        if (_.isFunction(models.getArtifactComponentModels)) {
            models = models.getArtifactComponentModels();
        }

        Ext.Array.each(models, function(m){
            if (m.typePath.indexOf("portfolioitem/") != -1){
                m.addField({name: 'PlanEstimate', type: 'auto', defaultValue: null, modelType: m.typePath});
                m.addField({name: 'Estimate', type: 'auto', defaultValue: null, modelType: m.typePath});
                m.addField({name: 'TimeSpent', type: 'auto', defaultValue: null, modelType: m.typePath});
            }
            if (m.typePath.indexOf("hierarchicalrequirement") != -1){
                m.addField({name: 'Estimate', type: 'auto', defaultValue: null, modelType: m.typePath});
                m.addField({name: 'TimeSpent', type: 'auto', defaultValue: null, modelType: m.typePath});
                m.addField({name: 'AcceptedLeafStoryPlanEstimateTotal', type: 'auto', defaultValue: null, modelType: m.typePath});
                m.addField({name: 'LeafStoryPlanEstimateTotal', type: 'auto', defaultValue: null, modelType: m.typePath});
            }            
        });

        _.each(Ext.Array.from(models), Rally.ui.grid.data.NodeInterface.decorate, Rally.ui.grid.data.NodeInterface);
    }
});