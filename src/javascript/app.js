Ext.define("TSAuditReport", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    
    config: {
        defaultSettings: {
            type : "Story",
            field : "ScheduleState"
        }
    },
    
    getSettingsFields: function() {
        return [
        {
            name: 'type',
            xtype:'rallycombobox',
            displayField: 'DisplayName',
            fieldLabel: 'Artifact Type',
            afterLabelTpl: 'Rally data type for which cycle time is being calculated<br/><span style="color:#999999;">eg.<i>Story</i> <i>Task</i> <i>Defect</i> <i>PortfolioItem/Feature</i></span>',

            autoExpand: true,
            storeConfig: {
                model:'TypeDefinition',
                filters: [
                  {property:'Restorable',value:true}
                ]
            },
            labelStyle : "width:200px;",
            labelAlign: 'left',
            minWidth: 200,
            margin: "0 0 15 50",
            valueField:'TypePath',
            bubbleEvents: ['select','ready','typeSelectedEvent'],
            readyEvent: 'ready',
               listeners: {
                ready: function(field_box,records) {
                    if (this.getRecord()!==false)
                        this.fireEvent('typeSelectedEvent', this.getRecord(),this.modelType);
                },
                select: function(field_picker,records) {
                    console.log("firing type event",this.getRecord());
                    this.fireEvent('typeSelectedEvent', this.getRecord(),this.modelType);
                }
            },
        },

        {
            name: 'field',
            xtype: 'rallyfieldcombobox',
            fieldLabel: 'Group By',
            margin: '0 0 15 50',
            labelStyle : "width:200px;",
            afterLabelTpl: 'The Rally field used for state<br/><span style="color:#999999;">eg. <i>ScheduleState State</i></span>',

            labelAlign: 'left',
            minWidth: 200,
            // margin: 10,
            autoExpand: false,
            alwaysExpanded: false,
            handlesEvents: { 
                select: function(type_picker) {
                    console.log("type_picker.getValue()",type_picker.getValue());
                    this.modelType = type_picker.getValue();
                    this.refreshWithNewModelType(type_picker.getValue());
                },
                ready: function(type_picker){
                    this.refreshWithNewModelType(type_picker.getValue());
                }
            },
            listeners: {
                ready: function(field_box,records) {
                    // me._filterOutExceptChoices(field_box.getStore());
                    console.log("field combo ready:",this.getRecord());
                    // if (this.getRecord()!==false)
                    //     this.fireEvent('myspecialevent1', this.getRecord(),this.modelType);
                },
                // select: function(field_picker,records) {
                //     console.log("firing event",field_picker,records);
                //     this.fireEvent('myspecialevent1', _.first(records),this.modelType);
                // }
            },
            // bubbleEvents: ['myspecialevent1'],
            readyEvent: 'ready'
        },

        ];
    },

    launch: function() {
        var me = this;
        this.setLoading("Loading stuff...");
        
        this._getHistory('HierarchicalRequirement').then({
            scope: this,
            success: function(records) {
                this._assignUsersToRecords(records).then({
                    scope: this,
                    success:function(records) {
                        var store = this._createStore(records);
                        this._displayGrid(store);
                    },
                    failure: function(error_message) {
                        alert(error_message);
                    }
                });
                
                
            },
            failure: function(error_message){
                alert(error_message);
            }
        }).always(function() {
            
        });
    },
    _assignUsersToRecords: function(records) {
        var deferred = Ext.create('Deft.Deferred');
        var users_to_check = [];
        var me = this;
        
        Ext.Array.each(records, function(record) {
            var user = record.get('_User');
            var user_filter = { property:'ObjectID', value: user };
            
            users_to_check = Ext.Array.merge(users_to_check,[user]);
            
        });
        
        var user_filter = Ext.Array.map(users_to_check, function(u) {
            return { property:'ObjectID', value: u };
        });
        
        this.logger.log('Users to Check: ', users_to_check);
        this.logger.log('Filter: ', user_filter);
        
        Ext.create('Rally.data.wsapi.Store',{
            model: 'User',
            filters:Rally.data.wsapi.Filter.or(user_filter),
            fetch: ['_refObjectName','UserName']
        }).load({
            callback : function(users, operation, successful) {
                if (successful){
                    me.logger.log(users);
                    
                    var user_hash = {};
                    Ext.Array.each(users, function(user) {
                        user_hash[user.get('ObjectID')] = user;
                    });
                    
                    Ext.Array.each(records, function(record){
                        record.set('__UserObject', user_hash[record.get('_User')]);
                    });
                    
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });        
        
        return deferred.promise;
    },
    _createStore: function(records) {
        this.logger.log(records);
        var store = Ext.create('Rally.data.custom.Store',{
            data: records
        });
        
        return store;
    },
    _getHistory: function(model_name){
        console.log("Type:",this.getSetting('type'));
        console.log("Field:",this.getSetting('field'));
        var type = this.getSetting('type');
        var field = this.getSetting('field');

        var deferred = Ext.create('Deft.Deferred');
        var me = this;
          
        Ext.create('Rally.data.lookback.SnapshotStore', {
            filters: [
                // {property: '_TypeHierarchy', operator: 'in', value: ['HierarchicalRequirement']},
                {property: '_TypeHierarchy', operator: 'in', value: [type]},
                {property: '_ProjectHierarchy', value: me.getContext().getProject().ObjectID },
                //{ property: "ObjectID", value: 17142502091 },
                // { property: "_PreviousValues.ScheduleState", operator: "exists", value: true }
                { property: "_PreviousValues." + field, operator: "exists", value: true }
            ],
            // fetch: ['_User','ScheduleState','_PreviousValues.ScheduleState','ObjectID','FormattedID','Name'],
            fetch: ['_User',field,'_PreviousValues.'+field,'ObjectID','FormattedID','Name'],
            // hydrate: ['ScheduleState','_PreviousValues.ScheduleState']
            hydrate: [field,'_PreviousValues.'+field]   
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    me.logger.log(records);
                    
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    _displayGrid: function(store){
        var type = this.getSetting('type');
        var field = this.getSetting('field');

        var columns = [
            { dataIndex: 'FormattedID', text: 'id' },
            { dataIndex: 'Name', text: 'id', flex: 1 },
            // { dataIndex: '_PreviousValues.ScheduleState', text: 'From State', renderer: function(value) {
            { dataIndex: '_PreviousValues.'+field, text: 'From State', renderer: function(value) {
                if ( !value ) {
                    return "No Previous State";
                }
                return value;
            } },

            // { dataIndex: 'ScheduleState', text: 'Into State' },
            { dataIndex: field, text: 'Into State' },
            { dataIndex: '__UserObject', text: 'Who', renderer: function(value, meta_data, record) {
                if ( !value ) {
                    meta_data.tdCls = 'red';
                    return '--';
                }
                if ( !value.get('_refObjectName') ) {
                    meta_data.tdCls = "yellow";
                    return '--';
                }
                
                return value.get('_refObjectName');
            } },
            { dataIndex: '_ValidFrom', text: 'When', renderer: function(value) {
                if ( !value ) { return "--"; }
                var display_value = Rally.util.DateTime.fromIsoString(value);
                return Ext.util.Format.date(display_value, 'Y-m-d');
            } }
        ];
        
        this.down('#display_box').add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: columns
        });
        
        this.setLoading(false);
    }
});
