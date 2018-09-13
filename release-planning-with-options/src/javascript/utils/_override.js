    Ext.override(Rally.ui.gridboard.planning.TimeboxColumnProgressBar, {

        initComponent: function() {
            var columnStore = this._getColumn().getStore();
            this.store = columnStore.clone();
            this.store.sorters = new Ext.util.MixedCollection();                

            if(this.pointField == 'RefinedEstimate'){
                this.store.fetch = 'RefinedEstimate';
                this.store.filters = columnStore.filters.clone();
                this.store.pageSize = 2000;
                this.store.limit = Infinity;                
            }else{
                this.store.fetch = ['sum:[' + this.pointField + ']'];
                this.store.filters = columnStore.filters.clone();
                this.store.pageSize = 1;
            }

        },

        _getTotalPointCount: function() {
            
            var pointFieldSum = 0;           
            if(this.pointField == 'RefinedEstimate'){
                Ext.Array.each(this.store.getRecords(), function(rec){
                    pointFieldSum += rec.get('RefinedEstimate') || 0;
                });
            }else{
                var sums = this.store.getSums();                
                pointFieldSum = sums[this.pointField];                
            }
            return pointFieldSum || 0;
        }                
    });