/*
	This file is part of myTinyTodo.
	(C) Copyright 2009-2010,2020 Max Pozdeev <maxpozdeev@gmail.com>
	Licensed under the GNU GPL v2 license. See file COPYRIGHT for details.
*/

(function(){

"use strict";

var taskList = new Array(), taskOrder = new Array();
var filter = { compl:0, search:'', due:'' };
var sortOrder; //save task order before dragging
var searchTimer;
var objPrio = {};
var lastClickedNodeId = 0;
var flag = { needAuth:false, isLogged:false, tagsChanged:true, readOnly:false, editFormChanged:false, firstLoad:true, historySkip:false };
var taskCnt = { total:0, past: 0, today:0, soon:0 };
var tabLists = {
	_lists: {},
	_length: 0,
	_order: [],
	_alltasks: {},
	clear: function(){
		this._lists = {}; this._length = 0; this._order = [];
		this._alltasks = { id:-1, showCompl:0, sort:3, name:_mtt.lang.get('alltasks') };
	},
	length: function(){ return this._length; },
	exists: function(id){ if(this._lists[id] || id==-1) return true; else return false; },
	add: function(list){ this._lists[list.id] = list; this._length++; this._order.push(list.id); },
	replace: function(list){ this._lists[list.id] = list; },
	get: function(id){ if(id==-1) return this._alltasks; else return this._lists[id]; },
	getAll: function(){ var r = []; for(var i in this._order) { r.push(this._lists[this._order[i]]); }; return r; },
	reorder: function(order){ this._order = order; }
};
var curList = 0;
var tagsList = [];
var _mtt; /* internal alias for window.mytinytodo */

var mytinytodo = window.mytinytodo = _mtt = {

	theme: {
		newTaskFlashColor: '#ffffaa',
		editTaskFlashColor: '#bbffaa',
		deleteTaskFlashColor: '#ffaaaa',
		msgFlashColor: '#ffffff'
	},

	actions: {},
	menus: {},
	mttUrl: '',
	homeUrl: '',
	options: {
		title: '',
		openList: 0,
		autotag: false,
		instantSearch: true,
		tagPreview: true,
		tagPreviewDelay: 700, //milliseconds
		saveShowNotes: false,
		firstdayofweek: 1,
		touchDevice: false,
		calendarIcon: 'calendar.png', // need templateUrl+icon
		history: true,
		markdown: true,
	},

	timers: {
		previewtag: 0
	},

	lang: {
		__lang: null,

		daysMin: [],
		daysLong: [],
		monthsShort: [],
		monthsLong: [],

		get: function(v) {
			if(this.__lang[v]) return this.__lang[v];
			else return v;
		},

		init: function(lang)
		{
			this.__lang = lang;
			this.daysMin = this.__lang.daysMin;
			this.daysLong = this.__lang.daysLong;
			this.monthsShort = this.__lang.monthsShort;
			this.monthsLong = this.__lang.monthsLong;
		},

		isRTL: function() {
			return this.get('_rtl') > 0 ? true : false;
		}
	},

	pages: {
		current: { page:'tasks', pageClass:'' },
		prev: []
	},

	curList: function(){
		return curList;
	},

	flag: flag,

	// procs
	setApi: function(storage)
	{
		this.db = new storage(this);
		return this;
	},

	init: function(options)
	{
		// required properties
		if (options.hasOwnProperty('lang')) {
			this.lang.init(options.lang);
			delete options.lang;
		}
		if (options.hasOwnProperty('mttUrl')) {
			this.mttUrl = options.mttUrl;
			delete options.mttUrl;
		}
		if (options.hasOwnProperty('db')) {
			delete options.db;
		}
		if (options.hasOwnProperty('homeUrl')) {
			this.homeUrl = options.homeUrl;
			delete options.homeUrl;
		}
		else {
			this.homeUrl = this.mttUrl;
		}
		if ( ! options.hasOwnProperty('touchDevice') ) {
			this.options.touchDevice = ('ontouchend' in document);
		}

		jQuery.extend(this.options, options);

		flag.needAuth = options.needAuth ? true : false;
		flag.isLogged = options.isLogged ? true : false;

		if(this.options.showdate) $('#page_tasks').addClass('show-inline-date');

		// handlers
		$('.mtt-tabs-add-button').click(function(){
			addList();
		});

		$('.mtt-tabs-select-button').click(function(event){
			if (!_mtt.menus.selectlist) {
				_mtt.menus.selectlist = new mttMenu( 'slmenucontainer', { onclick:slmenuSelect, alignRight: true } );
			}
			_mtt.menus.selectlist.show(this);
		});


		$('#newtask_form').submit(function(){
			submitNewTask(this);
			return false;
		});

		$('#newtask_submit').mousedown(function(e){
			e.preventDefault(); //keep the focus in #task
			$('#newtask_form').submit();
		});

		$('#newtask_adv').click(function(){
			showEditForm(1);
			return false;
		});

		$('#task').keydown(function(event){
			if(event.keyCode == 27) {
				$(this).val('');
			}
		}).focusin(function(){
			$('#task_placeholder').removeClass('placeholding');
			$('#toolbar').addClass('mtt-intask');
		}).focusout(function(){
			if('' == $(this).val()) $('#task_placeholder').addClass('placeholding');
			$('#toolbar').removeClass('mtt-intask');
		});


		$('#search_close').click(function(){
			liveSearchToggle(0);
			return false;
		});

		$('#search').keyup(function(event){
			if(event.keyCode == 27) return;
			if($(this).val() == '') $('#search_close').hide();	//actual value is only on keyup
			else $('#search_close').show();
			if (_mtt.options.instantSearch) {
				clearTimeout(searchTimer);
				searchTimer = setTimeout(function(){searchTasks()}, 400);
			}
		})
		.keydown(function(event){
			if(event.keyCode == 27) { // cancel on Esc (NB: no esc event on keypress in Chrome and on keyup in Opera)
				if($(this).val() != '') {
					$(this).val('');
					$('#search_close').hide();
					searchTasks();
				}
				else {
					liveSearchToggle(0);
				}
				return false; //need to return false in firefox (for AJAX?)
			}
			else if ( event.keyCode == 13 ) {
				searchTasks(1);
				return false;
			}
		}).focusin(function(){
			$('#toolbar').addClass('mtt-insearch');
		}).focusout(function(){
			$('#toolbar').removeClass('mtt-insearch');
		});


		$('#taskview').click(function(){
			if(!_mtt.menus.taskview) _mtt.menus.taskview = new mttMenu('taskviewcontainer');
			_mtt.menus.taskview.show(this);
		});

		$('#mtt-tag-filters').on('click', '.mtt-filter-close', function(){
			cancelTagFilter($(this).attr('tagid'));
		});

		$('#mtt-tag-toolbar-close').click(function(){
			cancelTagFilter(0);
		});

		$('#tagcloudbtn').click(function(){
			if(!_mtt.menus.tagcloud) _mtt.menus.tagcloud = new mttMenu('tagcloud', {
				beforeShow: function(){
					if(flag.tagsChanged) {
						$('#tagcloudcontent').html('');
						$('#tagcloudload').show();
						loadTags(curList.id, function(){$('#tagcloudload').hide();});
					}
				},
				alignRight:true
			});
			_mtt.menus.tagcloud.show(this);
		});

		$('#tagcloudcancel').click(function(){
			if(_mtt.menus.tagcloud) _mtt.menus.tagcloud.close();
		});

		$('#tagcloudcontent').on('click', '.tag', function(){
			addFilterTag( $(this).attr('tag'), $(this).attr('tagid'), (event.metaKey || event.ctrlKey ? true : false) );
			if(_mtt.menus.tagcloud) _mtt.menus.tagcloud.close();
			return false;
		});

		$('#mtt-notes-show').click(function(){
			toggleAllNotes(1);
			this.blur();
			return false;
		});

		$('#mtt-notes-hide').click(function(){
			toggleAllNotes(0);
			this.blur();
			return false;
		});

		$('#taskviewcontainer li').click(function(){
			if(this.id == 'view_tasks') setTaskview(0);
			else if(this.id == 'view_past') setTaskview('past');
			else if(this.id == 'view_today') setTaskview('today');
			else if(this.id == 'view_soon') setTaskview('soon');
		});


		// Tabs
		$('#lists').on('click', 'li.mtt-tab', function(event) {
			var listId = this.id.split('_', 2)[1];
			if (listId === 'all') listId = -1;
			if(event.metaKey || event.ctrlKey) {
				// hide the tab
				hideList(listId);
				return false;
			}
			tabSelect(listId);
			return false;
		});

		$('#lists').on('click', 'li.mtt-tab .list-action', function(){
			listMenu(this);
			return false;	//stop bubble to tab click
		});

		//Priority popup
		$('#priopopup .prio-neg-1').click(function(){
			prioClick(-1,this);
		});

		$('#priopopup .prio-zero').click(function(){
			prioClick(0,this);
		});

		$('#priopopup .prio-pos-1').click(function(){
			prioClick(1,this);
		});

		$('#priopopup .prio-pos-2').click(function(){
			prioClick(2,this);
		});

		$('#priopopup').mouseleave(function(){
			$(this).hide()}
		);


		// edit form handlers
		$('#alltags_show').click(function(){
			toggleEditAllTags(1);
			return false;
		});

		$('#alltags_hide').click(function(){
			toggleEditAllTags(0);
			return false;
		});

		$('#taskedit_form').submit(function(){
			return saveTask(this);
		});

		$('#alltags').on('click', '.tag', function(){
			addEditTag($(this).attr('tag'));
			return false;
		});

		$("#duedate").datepicker({
			dateFormat: _mtt.duedatepickerformat(),
			firstDay: _mtt.options.firstdayofweek,
			showOn: 'button',
			buttonImage: _mtt.options.calendarIcon,
			buttonImageOnly: true,
			constrainInput: false,
			duration:'',
			dayNamesMin:_mtt.lang.daysMin,
			dayNames:_mtt.lang.daysLong,
			monthNamesShort:_mtt.lang.monthsShort,
			monthNames:_mtt.lang.monthsLong,
			isRTL: _mtt.lang.isRTL()
		});

		function ac_split( val ) {
			return val.split( /,\s*/ );
		}
		function ac_extractLast( term ) {
			return ac_split( term ).pop();
		}

		$("#edittags").autocomplete({
		    source: function(request, response) {
		        var taskId = document.getElementById('taskedit_form').id.value;
		        var listId = taskList[taskId].listId;
				_mtt.db.request('suggestTags', {list:listId, q:ac_extractLast(request.term)}, function(json){
					response(json);
				})
		    },/*
			search: function() {
				// custom minLength
				var term = ac_extractLast( this.value );
				if ( term.length < 2 ) {
				  return false;
				}
			},*/
			focus: function() {
				// prevent value inserted on focus using keyboard
				return false;
			},
			select: function( event, ui ) {
				var terms = ac_split( this.value );
				terms.pop(); // remove the current input
				terms.push( ui.item.value ); // add the selected item
				terms.push( "" ); // add placeholder to get the comma-and-space at the end
				this.value = terms.join( ", " );
				return false;
			}
		});

		$('#taskedit_form').find('select,input,textarea').bind('change keypress', function(){
			flag.editFormChanged = true;
		});

		// tasklist handlers
		$("#tasklist").on('click', '> li.task-row .task-middle', function(e) {
			if ( findParentNode(e.target, 'A') ) {
				return; //ignore clicks on links
			}
			var li = findParentNode(this, 'LI');
			if (li && li.id) {
				if (lastClickedNodeId && li.id != lastClickedNodeId) {
					$('#'+lastClickedNodeId).removeClass('clicked');
				}
				lastClickedNodeId = li.id;
				$(li).toggleClass('clicked');
			}
		});

		$('#tasklist').on('dblclick', '> li.task-row', function(){
			//clear selection
			if(document.selection && document.selection.empty && document.selection.createRange().text) document.selection.empty();
			else if(window.getSelection) window.getSelection().removeAllRanges();

			if (this.id) {
				var id = this.id.split('_',2)[1];
				if (id) editTask(parseInt(id));
			}
		});

		$('#tasklist').on('click', '.taskactionbtn', function(){
			var id = parseInt(getLiTaskId(this));
			if(id) taskContextMenu(this, id);
			return false;
		});

		$('#tasklist').on('click', 'input[type=checkbox]', function(){
			var id = parseInt(getLiTaskId(this));
			if(id) completeTask(id, this);
			//return false;
		});

		$('#tasklist').on('click', '.task-toggle', function(){
			var id = getLiTaskId(this);
			if(id) $('#taskrow_'+id).toggleClass('task-expanded');
			return false;
		});

		$('#tasklist').on('click', '.tag', function(event){
			clearTimeout(_mtt.timers.previewtag);
			$('#tasklist li').removeClass('not-in-tagpreview');
			addFilterTag($(this).attr('tag'), $(this).attr('tagid'), (event.metaKey || event.ctrlKey ? true : false) );
			return false;
		});

		if(!this.options.touchDevice) {
			$('#tasklist').on('mouseover mouseout', '.task-prio', function(event){
				var id = parseInt(getLiTaskId(this));
				if(!id) return;
				if(event.type == 'mouseover') prioPopup(1, this, id);
				else prioPopup(0, this);
			});
		}

		$('#tasklist').on('click', '.mtt-action-note-cancel', function(){
			var id = parseInt(getLiTaskId(this));
			if(id) cancelTaskNote(id);
			return false;
		});

		$('#tasklist').on('click', '.mtt-action-note-save', function(){
			var id = parseInt(getLiTaskId(this));
			if(id) saveTaskNote(id);
			return false;
		});

		if (this.options.tagPreview && !this.options.touchDevice) {
			$('#tasklist').on('mouseover mouseout', '.tag', function(event){
				var cl = 'tag-id-' + $(this).attr('tagid');
				var sel = (event.metaKey || event.ctrlKey) ? 'li.'+cl : 'li:not(.'+cl+')';
				if(event.type == 'mouseover') {
					_mtt.timers.previewtag = setTimeout( function(){$('#tasklist '+sel).addClass('not-in-tagpreview');}, _mtt.options.tagPreviewDelay);
				}
				else {
					clearTimeout(_mtt.timers.previewtag);
					$('#tasklist li').removeClass('not-in-tagpreview');
				}
			});
		}

		$("#tasklist").sortable({
			items: '> :not(.task-completed)',
			cancel: 'span,input,a,textarea,.task-note-block',
			delay: 150,
			start: tasklistSortStart,
			update: tasklistSortUpdated,
			placeholder: 'mtt-task-placeholder',
			cursor: 'grabbing'
		});


		$("#lists ul").sortable({
			delay: 150,
			update: listOrderChanged,
			items: '> :not(.mtt-tabs-alltasks)',
			forcePlaceholderSize : true,
			placeholder: 'mtt-tab mtt-tab-sort-placeholder',
			cursor: 'grabbing'
		});


		if (this.options.touchDevice) {
			$("#tasklist").disableSelection();
			$("#tasklist").sortable('option', {
				axis: 'y',
				delay: 50,
				cancel: 'input',
				distance: 0
			});
			$('#cmenu_note').hide();
			$("#lists ul").sortable('disable');
		}


		// AJAX Errors
		$(document).ajaxSend(function(r,s){
			$("#msg").hide().removeClass('mtt-error mtt-info').find('.msg-details').hide();
			$("#loading").show();
		});

		$(document).ajaxStop(function(r,s){
			$("#loading").fadeOut();
		});

		$(document).ajaxError(function(event, request, settings){
			var errtxt;
			if(request.status == 0) errtxt = 'Bad connection';
			else if(request.status != 200) errtxt = 'HTTP: '+request.status+'/'+request.statusText;
			else errtxt = request.responseText;
			flashError(_mtt.lang.get('error'), errtxt);
		});


		// Error Message details
		$("#msg>.msg-text").click(function(){
			$("#msg>.msg-details").toggle();
		});


		// Authorization
		$('#bar_login').click(function(){
			showAuth(this);
			return false;
		});

		$('#bar_logout').click(function(){
			logout();
			return false;
		});

		$('#login_form').submit(function(){
			doAuth(this);
			return false;
		});


		// Settings
		$("#settings").click(showSettings);
		$("#page_ajax").on('submit', '#settings_form', function() {
			saveSettings(this);
			return false;
		});

		$(document).on('click', '.mtt-back-button', function(){ _mtt.pageBack(); this.blur(); return false; } );

		$(window).bind('beforeunload', function() {
			if(_mtt.pages.current.page == 'taskedit' && flag.editFormChanged) {
				return _mtt.lang.get('confirmLeave');
			}
		});


		// tab menu
		this.addAction('listSelected', tabmenuOnListSelected);

		// task context menu
		this.addAction('listsLoaded', cmenuOnListsLoaded);
		this.addAction('listRenamed', cmenuOnListRenamed);
		this.addAction('listAdded', cmenuOnListAdded);
		this.addAction('listSelected', cmenuOnListSelected);
		this.addAction('listOrderChanged', cmenuOnListOrderChanged);
		this.addAction('listHidden', cmenuOnListHidden);

		// select list menu
		this.addAction('listsLoaded', slmenuOnListsLoaded);
		this.addAction('listRenamed', slmenuOnListRenamed);
		this.addAction('listAdded', slmenuOnListAdded);
		this.addAction('listSelected', slmenuOnListSelected);
		this.addAction('listHidden', slmenuOnListHidden);

		//History
		if (this.options.history) {
			window.onpopstate = historyOnPopState;
			this.addAction('listSelected', historyListSelected);
		}

		this.doAction( 'init' );

		return this;
	},

	log: function(v)
	{
		console.log.apply(this, arguments);
	},

	addAction: function(action, proc)
	{
		if(!this.actions[action]) this.actions[action] = new Array();
		this.actions[action].push(proc);
	},

	doAction: function(action, opts)
	{
		if(!this.actions[action]) return;
		for(var i in this.actions[action]) {
			this.actions[action][i](opts);
		}
	},

	setOptions: function(opts) {
		jQuery.extend(this.options, opts);
	},

	run: function()
	{
		var path = this.parseAnchor();

		if (flag.firstLoad) {
			updateAccessStatus();
		}

		if (path.settings) {
			this.pages.current.onBack = function(){ this.loadLists(); }
			showSettings();
		}
		else {
			this.loadLists();
		}
	},

	loadLists: function()
	{
		if(filter.search != '') {
			filter.search = '';
			$('#searchbarkeyword').text('');
			$('#searchbar').hide();
		}
		$('#page_tasks').hide();
		$('#tasklist').html('');

		tabLists.clear();

		this.db.loadLists(null, function(res)
		{
			var ti = '';
			var openListId = 0;
			if(res && res.total)
			{
				// open required or first non-hidden list
				for(var i=0; i<res.list.length; i++) {
					if(_mtt.options.openList) {
						if(_mtt.options.openList == res.list[i].id) {
							openListId = res.list[i].id;
							break;
						}
					}
					else if(!res.list[i].hidden) {
						openListId = res.list[i].id;
						break;
					}
				}

				// open all tasks tab
				if(_mtt.options.openList == -1) openListId = -1;

				// or open first if all list are hidden
				if(!openListId) openListId = res.list[0].id;

				$.each(res.list, function(i,item) {
					if ( item.id == -1) {
						tabLists._alltasks = item;
						ti += '<li id="list_all" class="mtt-tab mtt-tabs-alltasks'+(item.hidden?' mtt-tabs-hidden':'')+'">'+
							'<a href="'+_mtt.urlForList(item)+'" title="'+item.name+'"><span>'+item.name+'</span>'+
							'<div class="list-action"></div></a></li>';
					}
					else {
						tabLists.add(item);
						ti += '<li id="list_'+item.id+'" class="mtt-tab'+(item.hidden?' mtt-tabs-hidden':'')+'">'+
							'<a href="'+_mtt.urlForList(item)+'" title="'+item.name+'"><span>'+item.name+'</span>'+
							'<div class="list-action"></div></a></li>';
					}
				});
			}

			if(openListId) {
				$('#mtt_body').removeClass('no-lists');
				$('.mtt-need-list').removeClass('mtt-item-disabled');
			}
			else {
				curList = 0;
				$('#mtt_body').addClass('no-lists');
				$('.mtt-need-list').addClass('mtt-item-disabled');
			}

			if (_mtt.options.openList && openListId != _mtt.options.openList) {
				//TODO: handle unknown list
			}

			if (_mtt.options.markdown == true) {
				$('#mtt_body').addClass('markdown-enabled');
			}

			_mtt.options.openList = 0;
			$('#lists ul').html(ti);
			$('#lists').show();
			_mtt.doAction('listsLoaded');
			tabSelect(openListId);

			flag.firstLoad = false;
			$('#page_tasks').show();

		});
	},

	duedatepickerformat: function()
	{
		if(!this.options.duedatepickerformat) return 'yy-mm-dd';

		var s = this.options.duedatepickerformat.replace(/(.)/g, function(t,s) {
			switch(t) {
				case 'Y': return 'yy';
				case 'y': return 'yy';
				case 'd': return 'dd';
				case 'j': return 'd';
				case 'm': return 'mm';
				case 'n': return 'm';
				case '/':
				case '.':
				case '-': return t;
				default: return '';
			}
		});

		if(s == '') return 'yy-mm-dd';
		return s;
	},

	errorDenied: function()
	{
		flashError(this.lang.get('denied'));
	},

	pageSet: function(page, pageClass)
	{
		var prev = this.pages.current;
		prev.lastScrollTop = $(window).scrollTop();
		this.pages.prev.push(this.pages.current);
		this.pages.current = {page:page, pageClass:pageClass};
		$('#mtt_body').removeClass('page-' + prev.page);
		$('#mtt_body').addClass('page-' + page);
		showhide($('#page_'+ this.pages.current.page).addClass('mtt-page-'+ this.pages.current.pageClass), $('#page_'+ prev.page));
	},

	pageBack: function()
	{
		if(this.pages.current.page == 'tasks') return false;
		var prev = this.pages.current;
		this.pages.current = this.pages.prev.pop();
		$('#mtt_body').removeClass('page-' + prev.page);
		$('#mtt_body').addClass('page-' + this.pages.current.page);
		showhide($('#page_'+ this.pages.current.page), $('#page_'+ prev.page).removeClass('mtt-page-'+prev.page.pageClass));
		$(window).scrollTop(this.pages.current.lastScrollTop);
		if (this.pages.current.onBack) this.pages.current.onBack.call(this);
	},


	filter: {
		_filters: [],
		clear: function() {
			this._filters = [];
			$('#mtt-tag-toolbar').hide();
			$('#mtt-tag-filters').html('');
		},
		addTag: function(tagId, tag, exclude)
		{
			for(var i in this._filters) {
				if(this._filters[i].tagId && this._filters[i].tagId == tagId) return false;
			}
			this._filters.push({tagId:tagId, tag:tag, exclude:exclude});
			var tagHtml = this.prepareTagHtml(tagId, tag, ['tag-filter', 'tag-id-'+tagId, exclude ? 'tag-filter-exclude' : '']) ;
			$('#mtt-tag-filters').append(tagHtml);
			$('#mtt-tag-toolbar').show();
			return true;
		},
		cancelTag: function(tagId)
		{
			for(var i in this._filters) {
				if(this._filters[i].tagId && this._filters[i].tagId == tagId) {
					this._filters.splice(i,1);
					$('#mtt-tag-filters .tag-filter.tag-id-'+tagId).remove();
					if (this._filters.length == 0) {
						$('#mtt-tag-toolbar').hide();
					}
					return true;
				}
			}
			return false;
		},
		getTags: function(withExcluded)
		{
			var a = [];
			for(var i in this._filters) {
				if(this._filters[i].tagId) {
					if(this._filters[i].exclude && withExcluded) a.push('^'+ this._filters[i].tag);
					else if(!this._filters[i].exclude) a.push(this._filters[i].tag)
				}
			}
			return a.join(', ');
		},
		prepareTagHtml: function(tagId, tag, classes)
		{
			return '<span class="' + classes.join(' ') + ' mtt-filter-close" tagid="' + tagId + '">' + tag + '<span class="tag-filter-btn"></span></span>';
		}
	},

	parseAnchor: function()
	{
		if(location.hash == '') return false;
		var h = location.hash.substr(1);
		var a = h.split("/");
		var p = {};
		var s = '';

		for(var i=0; i<a.length; i++)
		{
			s = a[i];
			switch(s) {
				case "list": if(a[++i].match(/^-?\d+$/)) { p[s] = a[i]; } break;
				case "alltasks": p.list = '-1'; break;
				case "settings": p.settings = true; break;
			}
		}

		if(p.list) this.options.openList = p.list;

		return p;
	},

	urlForList: function(list)
	{
		var l = list || curList;
		if (l === undefined) return '';
		if (l.id == -1) return '#alltasks';
		return '#list/' + l.id;
	},

	urlForExport: function(format, list)
	{
		var l = list || curList;
		if (l === undefined) return '';
		if (!format.match(/^[a-z0-9-]+$/i)) return '';
		return this.mttUrl + 'export.php?list='+l.id +'&format='+format;
	},

	urlForFeed: function(list)
	{
		var l = list || curList;
		if (l === undefined) return '';
		return _mtt.mttUrl + 'feed.php?list='+l.id;
	}

}; // End of mytinytodo object

function addList()
{
	mttPrompt( _mtt.lang.get('addList'), _mtt.lang.get('addListDefault'), function(r)
	{
		_mtt.db.request('addList', {name:r}, function(json){
			if (!parseInt(json.total)) return;
			var item = json.list[0];
			var i = tabLists.length();
			tabLists.add(item);
			if(i > 0) {
				$('#lists ul').append('<li id="list_'+item.id+'" class="mtt-tab">'+
						'<a href="#" title="'+item.name+'"><span>'+item.name+'</span>'+
						'<div class="list-action"></div></a></li>');
				mytinytodo.doAction('listAdded', item);
			}
			else _mtt.loadLists();
		});
	});
};

function renameCurList()
{
	if (!curList) return;
	mttPrompt( _mtt.lang.get('renameList'), dehtml(curList.name), function(r)
	{
		_mtt.db.request('renameList', {list:curList.id, name:r}, function(json){
			if (!parseInt(json.total)) return;
			var item = json.list[0];
			curList = item;
			tabLists.replace(item);
			$('#lists ul>.mtt-tabs-selected>a').attr('title', item.name).find('span').html(item.name); //FIXME: wft?
			mytinytodo.doAction('listRenamed', item);
		});
	});
};

function deleteCurList()
{
	if (!curList) return false;
	mttConfirm( _mtt.lang.get('deleteList'), function()
	{
		_mtt.db.request('deleteList', {list:curList.id}, function(json){
			if (!parseInt(json.total)) return;
			_mtt.loadLists();
		});
	});
};

function publishCurList()
{
	if(!curList) return false;
	_mtt.db.request('publishList', { list:curList.id, publish:curList.published?0:1 }, function(json){
		if(!parseInt(json.total)) return;
		curList.published = curList.published?0:1;
		if(curList.published) {
			$('#btnPublish').addClass('mtt-item-checked');
			$('#btnRssFeed').removeClass('mtt-item-disabled');
		}
		else {
			$('#btnPublish').removeClass('mtt-item-checked');
			$('#btnRssFeed').addClass('mtt-item-disabled');
		}
	});
};


function loadTasks(opts)
{
	if(!curList) return false;
	setSort(curList.sort, 1);
	opts = opts || {};
	if(opts.clearTasklist) {
		$('#tasklist').html('');
		$('#total').html('0');
	}

	_mtt.db.request('loadTasks', {
		list: curList.id,
		compl: curList.showCompl,
		sort: curList.sort,
		search: filter.search,
		tag: _mtt.filter.getTags(true),
		setCompl: opts.setCompl
	}, function(json){
		taskList.length = 0;
		taskOrder.length = 0;
		taskCnt.total = taskCnt.past = taskCnt.today = taskCnt.soon = 0;
		var tasks = '';
		$.each(json.list, function(i,item){
			tasks += _mtt.prepareTaskStr(item);
			taskList[item.id] = item;
			taskOrder.push(parseInt(item.id));
			changeTaskCnt(item, 1);
		});
		if(opts.beforeShow && opts.beforeShow.call) {
			opts.beforeShow();
		}
		refreshTaskCnt();
		$('#tasklist').html(tasks);
	});
};


function prepareTaskStr(item, noteExp)
{
	return '<li id="taskrow_'+item.id+'" class="task-row ' + (item.compl?'task-completed ':'') + item.dueClass + (item.note!=''?' task-has-note':'') +
				((curList.showNotes && item.note != '') || noteExp ? ' task-expanded' : '') + prepareDomClassOfTags(item.tags_ids) + '">' +
					prepareTaskBlocks(item) + "</li>\n";
};
_mtt.prepareTaskStr = prepareTaskStr;

function prepareTaskBlocks(item)
{
	var id = item.id;
	var markdown = '';
	if (_mtt.options.markdown == true) markdown = 'markdown-note';
	return '' +
		'<div class="task-block">' +
			'<div class="task-left">' +
				'<div class="task-toggle"></div>' +
				'<label><input type="checkbox" '+(flag.readOnly?'disabled="disabled"':'')+(item.compl?'checked="checked"':'')+'/></label>' +
			"</div>\n" +

			'<div class="task-middle">' +
				'<div class="task-through">' +
					preparePrio(item.prio,id) +
					'<span class="task-title">' + prepareTaskTitleInlineHtml(item.title) + '</span> ' +
					(curList.id == -1 ? '<span class="task-listname">'+ tabLists.get(item.listId).name +'</span>' : '') +
					prepareTagsStr(item) +
					'<span class="task-date">'+item.dateInlineTitle+'</span>' +
				'</div>' +
				'<div class="task-through-right">' + prepareDueDate(item) + prepareCompletedDate(item) + "</div>" +
			"</div>" +

			'<div class="task-actions"><div class="taskactionbtn"></div></div>' +
		'</div>' +

		'<div class="task-note-block">' +
			'<div id="tasknote' + id + '" class="task-note ' + markdown + '">' + prepareTaskNoteInlineHtml(item.note, item.noteText) + '</div>' +
			'<div id="tasknotearea'+id+'" class="task-note-area"><textarea id="notetext'+id+'"></textarea>'+
				'<span class="task-note-actions"><a href="#" class="mtt-action-note-save">'+_mtt.lang.get('actionNoteSave') +
					'</a> | <a href="#" class="mtt-action-note-cancel">'+_mtt.lang.get('actionNoteCancel')+'</a></span>' +
			'</div>' +
		'</div>';
};
_mtt.prepareTaskBlocks = prepareTaskBlocks;

function prepareTaskTitleInlineHtml(s)
{
	// Task title is already escaped on php back-end
	return s;
}
_mtt.prepareTaskTitleInlineHtml = prepareTaskTitleInlineHtml;

function prepareTaskNoteInlineHtml(s, rawText)
{
	// Task note is already escaped on php back-end
	return s;
};
_mtt.prepareTaskNoteInlineHtml = prepareTaskNoteInlineHtml;

function preparePrio(prio,id)
{
	var cl =''; var v = '';
	if(prio < 0) { cl = 'prio-neg prio-neg-'+Math.abs(prio); v = '&#8722;'+Math.abs(prio); }	// &#8722; = &minus; = −
	else if(prio > 0) { cl = 'prio-pos prio-pos-'+prio; v = '+'+prio; }
	else { cl = 'prio-zero'; v = '&#177;0'; }													// &#177; = &plusmn; = ±
	return '<span class="task-prio '+cl+'">'+v+'</span>';
};
_mtt.preparePrio = preparePrio;

function prepareTagsStr(item)
{
	if(!item.tags || item.tags == '') return '';
	var a = item.tags.split(',');
	if(!a.length) return '';
	var b = item.tags_ids.split(',')
	for(var i in a) {
		a[i] = '<a href="#" class="tag" tag="'+a[i]+'" tagid="'+b[i]+'">'+a[i]+'</a>';
	}
	return '<span class="task-tags">'+a.join(', ')+'</span>';
};
_mtt.prepareTagsStr = prepareTagsStr;

function prepareDomClassOfTags(ids)
{
	if(!ids || ids == '') return '';
	var a = ids.split(',');
	if(!a.length) return '';
	for(var i in a) {
		a[i] = 'tag-id-'+a[i];
	}
	return ' '+a.join(' ');
};
_mtt.prepareDomClassOfTags = prepareDomClassOfTags;

function prepareDueDate(item)
{
	if(!item.duedate) return '';
	return '<span class="duedate" title="'+item.dueTitle+'">'+item.dueStr+'</span>';
};
_mtt.prepareDueDate = prepareDueDate;

function prepareCompletedDate(item)
{
	// &mdash; = &#8212; = —
	return	'<span class="task-date-completed">' +
				'<span title="' + item.dateInlineTitle + '">' + item.dateInline + '</span>&#8212;' +
				'<span title="' + item.dateCompletedInlineTitle + '">' + item.dateCompletedInline + '</span>' +
			'</span>';
};
_mtt.prepareCompletedDate = prepareCompletedDate;


function submitNewTask(form)
{
	if(form.task.value == '') return false;
	_mtt.db.request('newTask', { list:curList.id, title: form.task.value, tag:_mtt.filter.getTags() }, function(json){
		if(!json.total) return;
		$('#total').text( parseInt($('#total').text()) + 1 );
		taskCnt.total++;
		form.task.value = '';
		var item = json.list[0];
		taskList[item.id] = item;
		taskOrder.push(parseInt(item.id));
		$('#tasklist').append(_mtt.prepareTaskStr(item));
		changeTaskOrder(item.id);
		$('#taskrow_'+item.id).effect("highlight", {color:_mtt.theme.newTaskFlashColor}, 2000);
		refreshTaskCnt();
	});
	flag.tagsChanged = true;
	return false;
};


function changeTaskOrder(id)
{
	id = parseInt(id);
	if(taskOrder.length < 2) return;
	var oldOrder = taskOrder.slice();
	// sortByHand
	if(curList.sort == 0) taskOrder.sort( function(a,b){
			if(taskList[a].compl != taskList[b].compl) return taskList[a].compl-taskList[b].compl;
			return taskList[a].ow-taskList[b].ow
		});
	// sortByPrio
	else if(curList.sort == 1) taskOrder.sort( function(a,b){
			if(taskList[a].compl != taskList[b].compl) return taskList[a].compl-taskList[b].compl;
			if(taskList[a].prio != taskList[b].prio) return taskList[b].prio-taskList[a].prio;
			if(taskList[a].dueInt != taskList[b].dueInt) return taskList[a].dueInt-taskList[b].dueInt;
			return taskList[a].ow-taskList[b].ow;
		});
	// sortByPrio (reverse)
	else if(curList.sort == 101) taskOrder.sort( function(a,b){
			if(taskList[a].compl != taskList[b].compl) return taskList[a].compl-taskList[b].compl;
			if(taskList[a].prio != taskList[b].prio) return taskList[a].prio-taskList[b].prio;
			if(taskList[a].dueInt != taskList[b].dueInt) return taskList[b].dueInt-taskList[a].dueInt;
			return taskList[b].ow-taskList[a].ow;
		});
	// sortByDueDate
	else if(curList.sort == 2) taskOrder.sort( function(a,b){
			if(taskList[a].compl != taskList[b].compl) return taskList[a].compl-taskList[b].compl;
			if(taskList[a].dueInt != taskList[b].dueInt) return taskList[a].dueInt-taskList[b].dueInt;
			if(taskList[a].prio != taskList[b].prio) return taskList[b].prio-taskList[a].prio;
			return taskList[a].ow-taskList[b].ow;
		});
	// sortByDueDate (reverse)
	else if(curList.sort == 102) taskOrder.sort( function(a,b){
			if(taskList[a].compl != taskList[b].compl) return taskList[a].compl-taskList[b].compl;
			if(taskList[a].dueInt != taskList[b].dueInt) return taskList[b].dueInt-taskList[a].dueInt;
			if(taskList[a].prio != taskList[b].prio) return taskList[a].prio-taskList[b].prio;
			return taskList[b].ow-taskList[a].ow;
		});
	// sortByDateCreated
	else if(curList.sort == 3) taskOrder.sort( function(a,b){
			if(taskList[a].compl != taskList[b].compl) return taskList[a].compl-taskList[b].compl;
			if(taskList[a].dateInt != taskList[b].dateInt) return taskList[a].dateInt-taskList[b].dateInt;
			if(taskList[a].prio != taskList[b].prio) return taskList[b].prio-taskList[a].prio;
			return taskList[a].ow-taskList[b].ow;
		});
	// sortByDateCreated (reverse)
	else if(curList.sort == 103) taskOrder.sort( function(a,b){
			if(taskList[a].compl != taskList[b].compl) return taskList[a].compl-taskList[b].compl;
			if(taskList[a].dateInt != taskList[b].dateInt) return taskList[b].dateInt-taskList[a].dateInt;
			if(taskList[a].prio != taskList[b].prio) return taskList[a].prio-taskList[b].prio;
			return taskList[b].ow-taskList[a].ow;
		});
	// sortByDateModified
	else if(curList.sort == 4) taskOrder.sort( function(a,b){
			if(taskList[a].compl != taskList[b].compl) return taskList[a].compl-taskList[b].compl;
			if(taskList[a].dateEditedInt != taskList[b].dateEditedInt) return taskList[a].dateEditedInt-taskList[b].dateEditedInt;
			if(taskList[a].prio != taskList[b].prio) return taskList[b].prio-taskList[a].prio;
			return taskList[a].ow-taskList[b].ow;
		});
	// sortByDateModified (reverse)
	else if(curList.sort == 104) taskOrder.sort( function(a,b){
			if(taskList[a].compl != taskList[b].compl) return taskList[a].compl-taskList[b].compl;
			if(taskList[a].dateEditedInt != taskList[b].dateEditedInt) return taskList[b].dateEditedInt-taskList[a].dateEditedInt;
			if(taskList[a].prio != taskList[b].prio) return taskList[a].prio-taskList[b].prio;
			return taskList[b].ow-taskList[a].ow;
		});
	else return;
	if(oldOrder.toString() == taskOrder.toString()) return;
	if(id && taskList[id])
	{
		// optimization: determine where to insert task: top or after some task
		var indx = $.inArray(id,taskOrder);
		if(indx ==0) {
			$('#tasklist').prepend($('#taskrow_'+id))
		} else {
			var after = taskOrder[indx-1];
			$('#taskrow_'+after).after($('#taskrow_'+id));
		}
	}
	else {
		var o = $('#tasklist');
		for(var i in taskOrder) {
			o.append($('#taskrow_'+taskOrder[i]));
		}
	}
};


function prioPopup(act, el, id)
{
	if(act == 0) {
		clearTimeout(objPrio.timer);
		return;
	}
	var offset = $(el).offset();
	$('#priopopup').css({ position: 'absolute', top: offset.top + 1, left: offset.left + 1 });
	objPrio.taskId = id;
	objPrio.el = el;
	objPrio.timer = setTimeout("$('#priopopup').show()", 300);
};

function prioClick(prio, el)
{
	el.blur();
	prio = parseInt(prio);
	$('#priopopup').fadeOut('fast'); //.hide();
	setTaskPrio(objPrio.taskId, prio);
};

function setTaskPrio(id, prio)
{
	_mtt.db.request('setPrio', {id:id, prio:prio});
	taskList[id].prio = prio;
	var $t = $('#taskrow_'+id);
	$t.find('.task-prio').replaceWith(preparePrio(prio, id));
	if(curList.sort != 0) changeTaskOrder(id);
	$t.effect("highlight", {color:_mtt.theme.editTaskFlashColor}, 'normal');
};

function setSort(v, init)
{
	$('#listmenucontainer .sort-item').removeClass('mtt-item-checked').children('.mtt-sort-direction').text('');
	if(v == 0) $('#sortByHand').addClass('mtt-item-checked');
	else if(v==1 || v==101) $('#sortByPrio').addClass('mtt-item-checked').children('.mtt-sort-direction').text(v==1 ? '↑' : '↓');
	else if(v==2 || v==102) $('#sortByDueDate').addClass('mtt-item-checked').children('.mtt-sort-direction').text(v==2 ? '↑' : '↓');
	else if(v==3 || v==103) $('#sortByDateCreated').addClass('mtt-item-checked').children('.mtt-sort-direction').text(v==3 ? '↓' : '↑');
	else if(v==4 || v==104) $('#sortByDateModified').addClass('mtt-item-checked').children('.mtt-sort-direction').text(v==4 ? '↓' : '↑');
	else return;

	curList.sort = v;
	if(v == 0 && !flag.readOnly) $("#tasklist").sortable('enable');
	else $("#tasklist").sortable('disable');

	if(!init)
	{
		changeTaskOrder();
		if(!flag.readOnly) _mtt.db.request('setSort', {list:curList.id, sort:curList.sort});
	}
};


function changeTaskCnt(task, dir, old)
{
	if(dir > 0) dir = 1;
	else if(dir < 0) dir = -1;
	if(dir == 0 && old != null && task.dueClass != old.dueClass) //on saveTask
	{
		if(old.dueClass != '') taskCnt[old.dueClass]--;
		if(task.dueClass != '') taskCnt[task.dueClass]++;
	}
	else if(dir == 0 && old == null) //on comleteTask
	{
		if(!curList.showCompl && task.compl) taskCnt.total--;
		if(task.dueClass != '') taskCnt[task.dueClass] += task.compl ? -1 : 1;
	}
	if(dir != 0) {
		if(task.dueClass != '' && !task.compl) taskCnt[task.dueClass] += dir;
		taskCnt.total += dir;
	}
};

function refreshTaskCnt()
{
	$('#cnt_total').text(taskCnt.total);
	$('#cnt_past').text(taskCnt.past);
	$('#cnt_today').text(taskCnt.today);
	$('#cnt_soon').text(taskCnt.soon);
	if(filter.due == '') $('#total').text(taskCnt.total);
	else if(taskCnt[filter.due] != null) $('#total').text(taskCnt[filter.due]);
};


function setTaskview(v)
{
	if(v == 0)
	{
		if(filter.due == '') return;
		$('#taskview .btnstr').text(_mtt.lang.get('tasks'));
		$('#tasklist').removeClass('filter-'+filter.due);
		filter.due = '';
		$('#total').text(taskCnt.total);
	}
	else if(v=='past' || v=='today' || v=='soon')
	{
		if(filter.due == v) return;
		else if(filter.due != '') {
			$('#tasklist').removeClass('filter-'+filter.due);
		}
		$('#tasklist').addClass('filter-'+v);
		$('#taskview .btnstr').text(_mtt.lang.get('f_'+v));
		$('#total').text(taskCnt[v]);
		filter.due = v;
	}
};


function toggleAllNotes(show)
{
	for(var id in taskList)
	{
		if(taskList[id].note == '') continue;
		if(show) $('#taskrow_'+id).addClass('task-expanded');
		else $('#taskrow_'+id).removeClass('task-expanded');
	}
	curList.showNotes = show;
	if(_mtt.options.saveShowNotes) _mtt.db.request('setShowNotesInList', {list:curList.id, shownotes:show}, function(json){});
};


function tabSelect(elementOrId)
{
	var id;
	if (typeof elementOrId == 'number') id = elementOrId;
	else if(typeof elementOrId == 'string') id = parseInt(elementOrId);
	else {
		id = $(elementOrId).attr('id');
		if (!id ) return;
		id = id.split('_', 2)[1];
		if (id === 'all') id = -1;
	}
	if ( !tabLists.exists(id) ) {
		// TODO: handle unknown list
		flashError(_mtt.lang.get('denied'), id);
		return;
	}

	var prevList = curList;
	curList = tabLists.get(id);
	document.title = curList.name + ' - ' + _mtt.options.title;

	$('#lists .mtt-tabs-selected').removeClass('mtt-tabs-selected');

	if(id == -1) {
		$('#list_all').addClass('mtt-tabs-selected').removeClass('mtt-tabs-hidden');
		$('#listmenucontainer .mtt-need-real-list').addClass('mtt-item-hidden');
	}
	else {
		$('#list_'+id).addClass('mtt-tabs-selected').removeClass('mtt-tabs-hidden');
		$('#listmenucontainer .mtt-need-real-list').removeClass('mtt-item-hidden');
	}

	if(prevList.id != id)
	{
		if(id == -1) $('#mtt_body').addClass('show-all-tasks');
		else $('#mtt_body').removeClass('show-all-tasks');
		if(filter.search != '') liveSearchToggle(0, 1);
		mytinytodo.doAction('listSelected', tabLists.get(id));
	}

	if(curList.hidden) {
		curList.hidden = false;
		_mtt.db.request('setHideList', {list:curList.id, hide:0});
	}
	flag.tagsChanged = true;
	cancelTagFilter(0, 1);
	setTaskview(0);
	loadTasks({clearTasklist:1});
};



function listMenu(el)
{
	if(!mytinytodo.menus.listMenu) mytinytodo.menus.listMenu = new mttMenu('listmenucontainer', {onclick:listMenuClick, onhover:listMenuHover});
	mytinytodo.menus.listMenu.show(el);
};

function listMenuClick(el, menu)
{
	if(!el.id) return;
	switch(el.id) {
		case 'btnAddList': addList(); break;
		case 'btnRenameList': renameCurList(); break;
		case 'btnDeleteList': deleteCurList(); break;
		case 'btnPublish': publishCurList(); break;
		case 'btnHideList': hideList(curList.id); break;
		case 'btnExportCSV': return true;
		case 'btnExportICAL': return true;
		case 'btnRssFeed': return true;
		case 'btnShowCompleted': showCompletedToggle(); break;
		case 'btnClearCompleted': clearCompleted(); break;
		case 'sortByHand': setSort(0); break;
		case 'sortByPrio': setSort(curList.sort==1 ? 101 : 1); break;
		case 'sortByDueDate': setSort(curList.sort==2 ? 102 : 2); break;
		case 'sortByDateCreated': setSort(curList.sort==3 ? 103 : 3); break;
		case 'sortByDateModified': setSort(curList.sort==4 ? 104 : 4); break;
	}
	return false;
};

function listMenuHover(el, menu)
{
	if(!el.id) return;
	switch(el.id) {
		case 'btnExportCSV': $('#'+el.id+'>a').attr('href', _mtt.urlForExport('csv')) ; break;
		case 'btnExportICAL': $('#'+el.id+'>a').attr('href', _mtt.urlForExport('ical')) ; break;
		case 'btnRssFeed': $('#'+el.id+'>a').attr('href', _mtt.urlForFeed()) ; break;
	}
}

function deleteTask(id)
{
	mttConfirm( _mtt.lang.get('confirmDelete'), function()
	{
		flag.tagsChanged = true;
		_mtt.db.request('deleteTask', {id:id}, function(json){
			if (!parseInt(json.total)) return;
			var item = json.list[0];
			taskOrder.splice($.inArray(id,taskOrder), 1);
			$('#taskrow_'+id).effect("highlight", {color:_mtt.theme.deleteTaskFlashColor}, 'normal', function(){ $(this).remove() });
			changeTaskCnt(taskList[id], -1);
			refreshTaskCnt();
			delete taskList[id];
		});
	})
	return false;
};

function completeTask(id, ch)
{
	if(!taskList[id]) return; //click on already removed from the list while anim. effect
	var compl = 0;
	if(ch.checked) compl = 1;
	_mtt.db.request('completeTask', {id:id, compl:compl, list:curList.id}, function(json){
		if(!parseInt(json.total)) return;
		var item = json.list[0];
		if(item.compl) $('#taskrow_'+id).addClass('task-completed');
		else $('#taskrow_'+id).removeClass('task-completed');
		taskList[id] = item;
		changeTaskCnt(taskList[id], 0);
		if(item.compl && !curList.showCompl) {
			delete taskList[id];
			taskOrder.splice($.inArray(id,taskOrder), 1);
			$('#taskrow_'+id).fadeOut('normal', function(){ $(this).remove() });
		}
		else if(curList.showCompl) {
			$('#taskrow_'+item.id).replaceWith(_mtt.prepareTaskStr(taskList[id]));
			$('#taskrow_'+id).fadeOut('fast', function(){
				changeTaskOrder(id);
				$(this).effect("highlight", {color:_mtt.theme.editTaskFlashColor}, 'normal', function(){$(this).css('display','')});
			});
		}
		refreshTaskCnt();
	});
	return false;
};

function toggleTaskNote(id)
{
	var aArea = '#tasknotearea'+id;
	if($(aArea).css('display') == 'none')
	{
		$('#notetext'+id).val(taskList[id].noteText);
		$(aArea).show();
		$('#tasknote'+id).hide();
		$('#taskrow_'+id).addClass('task-expanded');
		$('#notetext'+id).focus();
	} else {
		cancelTaskNote(id)
	}
	return false;
};

function cancelTaskNote(id)
{
	if(taskList[id].note == '') $('#taskrow_'+id).removeClass('task-expanded');
	$('#tasknotearea'+id).hide();
	$('#tasknote'+id).show();
	return false;
};

function saveTaskNote(id)
{
	_mtt.db.request('editNote', {id:id, note:$('#notetext'+id).val()}, function(json){
		if(!parseInt(json.total)) return;
		var item = json.list[0];
		taskList[id].note = item.note;
		taskList[id].noteText = item.noteText;
		$('#tasknote'+id).html(prepareTaskNoteInlineHtml(item.note, item.noteText));
		if(item.note == '') $('#taskrow_'+id).removeClass('task-has-note task-expanded');
		else $('#taskrow_'+id).addClass('task-has-note task-expanded');
		cancelTaskNote(id);
	});
	return false;
};

function editTask(id)
{
	var item = taskList[id];
	if(!item) return false;
	// no need to clear form
	var form = document.getElementById('taskedit_form');
	form.task.value = item.titleText;
	form.note.value = item.noteText;
	form.id.value = item.id;
	form.tags.value = item.tags.split(',').join(', ');
	form.duedate.value = item.duedate;
	form.prio.value = item.prio;
	$('#taskedit-date .date-created>span').text(item.date);
	if(item.compl) $('#taskedit-date .date-completed').show().find('span').text(item.dateCompleted);
	else $('#taskedit-date .date-completed').hide();
	toggleEditAllTags(0);
	showEditForm();
	return false;
};

function clearEditForm()
{
	var form = document.getElementById('taskedit_form');
	form.task.value = '';
	form.note.value = '';
	form.tags.value = '';
	form.duedate.value = '';
	form.prio.value = '0';
	form.id.value = '';
	toggleEditAllTags(0);
};

function showEditForm(isAdd)
{
	var form = document.getElementById('taskedit_form');
	if(isAdd)
	{
		clearEditForm();
		$('#page_taskedit').removeClass('mtt-inedit').addClass('mtt-inadd');
		form.isadd.value = 1;
		if(_mtt.options.autotag) form.tags.value = _mtt.filter.getTags();
		if($('#task').val() != '')
		{
			_mtt.db.request('parseTaskStr', { list:curList.id, title:$('#task').val(), tag:_mtt.filter.getTags() }, function(json){
				if(!json) return;
				form.task.value = json.title
				form.tags.value = (form.tags.value != '') ? form.tags.value +', '+ json.tags : json.tags;
				form.prio.value = json.prio;
				$('#task').val('');

			});
		}
	}
	else {
		$('#page_taskedit').removeClass('mtt-inadd').addClass('mtt-inedit');
		form.isadd.value = 0;
	}

	flag.editFormChanged = false;
	_mtt.pageSet('taskedit');
};

function saveTask(form)
{
	if(flag.readOnly) return false;
	if(form.isadd.value != 0)
		return submitFullTask(form);

	_mtt.db.request('editTask', {id:form.id.value, title: form.task.value, note:form.note.value,
		prio:form.prio.value, tags:form.tags.value, duedate:form.duedate.value},
		function(json){
			if(!parseInt(json.total)) return;
			var item = json.list[0];
			changeTaskCnt(item, 0, taskList[item.id]);
			taskList[item.id] = item;
			var noteExpanded = (item.note != '' && $('#taskrow_'+item.id).is('.task-expanded')) ? 1 : 0;
			$('#taskrow_'+item.id).replaceWith(_mtt.prepareTaskStr(item, noteExpanded));
			if(curList.sort != 0) changeTaskOrder(item.id);
			_mtt.pageBack(); //back to list
			refreshTaskCnt();
			$('#taskrow_'+item.id).effect("highlight", {color:_mtt.theme.editTaskFlashColor}, 'normal', function(){$(this).css('display','')});
	});
	flag.tagsChanged = true;
	return false;
};

function toggleEditAllTags(show)
{
	if(show)
	{
		if(curList.id == -1) {
			var taskId = document.getElementById('taskedit_form').id.value;
			loadTags(taskList[taskId].listId, fillEditAllTags);
		}
		else if(flag.tagsChanged) loadTags(curList.id, fillEditAllTags);
		else fillEditAllTags();
		showhide($('#alltags_hide'), $('#alltags_show'));
	}
	else {
		$('#alltags').hide();
		showhide($('#alltags_show'), $('#alltags_hide'))
	}
};

function fillEditAllTags()
{
	var a = [];
	for(var i=tagsList.length-1; i>=0; i--) {
		a.push('<a href="#" class="tag" tag="'+tagsList[i].tag+'">'+tagsList[i].tag+'</a>');
	}
	$('#alltags .tags-list').html(a.join(', '));
	$('#alltags').show();
};

function addEditTag(tag)
{
	var v = $('#edittags').val();
	if(v == '') {
		$('#edittags').val(tag);
		return;
	}
	var r = v.search(new RegExp('(^|,)\\s*'+tag+'\\s*(,|$)'));
	if(r < 0) $('#edittags').val(v+', '+tag);
};

function loadTags(listId, callback)
{
	_mtt.db.request('tagCloud', {list:listId}, function(json){
		if(!parseInt(json.total)) tagsList = [];
		else tagsList = json.cloud;
		var cloud = '';
		$.each(tagsList, function(i,item){
			cloud += ' <a href="#" tag="'+item.tag+'" tagid="'+item.id+'" class="tag w'+item.w+'" >'+item.tag+'</a>';
		});
		$('#tagcloudcontent').html(cloud)
		flag.tagsChanged = false;
		callback();
	});
};

function cancelTagFilter(tagId, dontLoadTasks)
{
	if(tagId)  _mtt.filter.cancelTag(tagId);
	else _mtt.filter.clear();
	if(dontLoadTasks==null || !dontLoadTasks) loadTasks();
};

function addFilterTag(tag, tagId, exclude)
{
	if(!_mtt.filter.addTag(tagId, tag, exclude)) return false;
	loadTasks();
};

function liveSearchToggle(toSearch, dontLoad)
{
	if(toSearch)
	{
		$('#search').focus();
	}
	else
	{
		if($('#search').val() != '') {
			filter.search = '';
			$('#search').val('');
			$('#searchbarkeyword').text('');
			$('#searchbar').hide();
			$('#search_close').hide();
			if(!dontLoad) loadTasks();
		}

		$('#search').blur();
	}
};

function searchTasks(force)
{
	var newkeyword = $('#search').val();
	if(newkeyword == filter.search && !force) return false;
	filter.search = newkeyword;
	if (filter.search != '') {
		$('#searchbarkeyword').text(filter.search);
		$('#searchbar').fadeIn('fast');
	}
	else $('#searchbar').fadeOut('fast');
	loadTasks();
	return false;
};


function submitFullTask(form)
{
	if(flag.readOnly) return false;

	_mtt.db.request('fullNewTask', { list:curList.id, tag:_mtt.filter.getTags(), title: form.task.value, note:form.note.value,
			prio:form.prio.value, tags:form.tags.value, duedate:form.duedate.value }, function(json){
		if(!parseInt(json.total)) return;
		form.task.value = '';
		var item = json.list[0];
		taskList[item.id] = item;
		taskOrder.push(parseInt(item.id));
		$('#tasklist').append(_mtt.prepareTaskStr(item));
		changeTaskOrder(item.id);
		_mtt.pageBack();
		$('#taskrow_'+item.id).effect("highlight", {color:_mtt.theme.newTaskFlashColor}, 2000);
		changeTaskCnt(item, 1);
		refreshTaskCnt();
	});

	flag.tagsChanged = true;
	return false;
};


function tasklistSortStart(event, ui)
{
	// remember initial order before sorting
	sortOrder = $(this).sortable('toArray');
};

function tasklistSortUpdated(event, ui)
{
	if(!ui.item[0]) return;
	var itemId = ui.item[0].id;
	var n = $(this).sortable('toArray');

	// remove possible empty id's
	for(var i=0; i<sortOrder.length; i++) {
		if(sortOrder[i] == '') { sortOrder.splice(i,1); i--; }
	}
	if(n.toString() == sortOrder.toString()) return;

	// make index: id=>position
	var h0 = {}; //before
	for(var j=0; j<sortOrder.length; j++) {
		h0[sortOrder[j]] = j;
	}
	var h1 = {}; //after
	for(var j=0; j<n.length; j++) {
		h1[n[j]] = j;
		taskOrder[j] = parseInt(n[j].split('_')[1]);
	}

	// prepare param
	var o = [];
	var diff;
	var replaceOW = taskList[sortOrder[h1[itemId]].split('_')[1]].ow;
	for(var j in h0)
	{
		diff = h1[j] - h0[j];
		if(diff != 0) {
			var a = j.split('_');
			if(j == itemId) diff = replaceOW - taskList[a[1]].ow;
			o.push({id:a[1], diff:diff});
			taskList[a[1]].ow += diff;
		}
	}

	_mtt.db.request('changeOrder', {order:o});
};


function mttMenu(container, options)
{
	var menu = this;
	this.container = document.getElementById(container);
	this.$container = $(this.container);
	this.isOpen = false;
	this.options = options || {};
	this.submenu = [];
	this.curSubmenu = null;
	this.showTimer = null;
	this.ts = (new Date).getTime();
	this.container.mttmenu = this.ts;

	if (!this.options.hasOwnProperty('isRTL')) {
		this.options.isRTL = ($('body').css('direction') == 'rtl') ? true : false;
	}
	if (!this.options.hasOwnProperty('alignRight')) {
		this.options.alignRight = false;
	}
	if (!this.options.hasOwnProperty('adjustWidth')) {
		this.options.adjustWidth = true;
	}

	this.$container.find('li').click(function(){
		var r = menu.onclick(this, menu);
		return (typeof r === 'undefined') ? false : r;
	})
	.each(function(){

		var submenu = 0;
		if($(this).is('.mtt-menu-indicator'))
		{
			submenu = new mttMenu($(this).attr('submenu'), menu.options);
			submenu.$caller = $(this);
			submenu.parent = menu;
			if(menu.root) submenu.root = menu.root;	//!! be careful with circular references
			else submenu.root = menu;
			menu.submenu.push(submenu);
			submenu.ts = submenu.container.mttmenu = submenu.root.ts;
		}

		$(this).hover(
			function(){
				if(!$(this).is('.mtt-menu-item-active')) menu.$container.find('li').removeClass('mtt-menu-item-active');
				clearTimeout(menu.showTimer);
				if(menu.hideTimer && menu.parent) {
					clearTimeout(menu.hideTimer);
					menu.hideTimer = null;
					menu.$caller.addClass('mtt-menu-item-active');
					clearTimeout(menu.parent.showTimer);
				}

				if(menu.curSubmenu && menu.curSubmenu.isOpen && menu.curSubmenu != submenu && !menu.curSubmenu.hideTimer)
				{
					menu.$container.find('li').removeClass('mtt-menu-item-active');
					var curSubmenu = menu.curSubmenu;
					curSubmenu.hideTimer = setTimeout(function(){
						curSubmenu.hide();
						curSubmenu.hideTimer = null;
					}, 300);
				}

				if (menu.options.onhover) menu.options.onhover(this, menu);

				if(!submenu || menu.curSubmenu == submenu && menu.curSubmenu.isOpen)
					return;

				menu.showTimer = setTimeout(function(){
					menu.curSubmenu = submenu;
					submenu.showSub();
				}, 400);
			},
			function(){}
		);

	});

	this.onclick = function(item, fromMenu)
	{
		if ($(item).is('.mtt-item-disabled,.mtt-menu-indicator,.mtt-item-hidden')) return;
		var r = undefined;
		if (this.options.onclick) r = this.options.onclick(item, fromMenu);
		if (menu.root) menu.root.close();
		else menu.close();
		return r;
	};

	this.hide = function()
	{
		for(var i in this.submenu) this.submenu[i].hide();
		clearTimeout(this.showTimer);
		this.$container.hide();
		this.$container.find('li').removeClass('mtt-menu-item-active');
		this.isOpen = false;
	};

	this.close = function(event)
	{
		if(!this.isOpen) return;
		if(event)
		{
			// ignore if event (click) was on caller or container
			var t = event.target;
			if(t == this.caller || (t.mttmenu && t.mttmenu == this.ts)) return;
			while(t.parentNode) {
				if(t.parentNode == this.caller || (t.mttmenu && t.mttmenu == this.ts)) return;
				t = t.parentNode;
			}
		}
		this.hide();
		$(this.caller).removeClass('mtt-menu-button-active');
		$(document).off('mousedown.mttmenu');
		$(document).off('keydown.mttmenu');

		// onClose trigger
		if(this.options.onClose && this.options.onClose.call) {
			this.options.onClose.call(this);
		}
	};

	this.show = function(caller)
	{
		if(this.isOpen)
		{
			this.close();
			if(this.caller && this.caller == caller) return;
		}
		$(document).triggerHandler('mousedown.mttmenu'); //close any other open menu
		$(document).on('keydown.mttmenu', function(event) {
			if (event.keyCode == 27) {
				menu.close(); //close the menu on Esc pressed
			}
		});
		this.caller = caller;
		var $caller = $(caller);

		// beforeShow trigger
		if(this.options.beforeShow && this.options.beforeShow.call) {
			this.options.beforeShow.call(this);
		}

		// adjust width
		if (this.options.adjustWidth) {
			this.$container.width('');
			this.$container.removeClass('mtt-left-adjusted mtt-right-adjusted');
			if ( this.$container.outerWidth(true) > $(window).width() ) {
				this.$container.addClass('mtt-left-adjusted mtt-right-adjusted');
				this.$container.width( $(window).width() - (this.$container.outerWidth(true) - this.$container.width()) );
			}
		}

		//round the width to avoid overflow issues
		this.$container.width( Math.ceil(this.$container.width()) );

		$caller.addClass('mtt-menu-button-active');
		var offset = $caller.offset();
		var containerWidth = this.$container.outerWidth(true);
		var alignRight = this.options.isRTL ^ this.options.alignRight; //alignRight is not for submenu

		var x2 = $(window).width() + $(document).scrollLeft() - containerWidth - 1; // TODO: rtl?
		var x = alignRight ? offset.left + $caller.outerWidth() - containerWidth : offset.left;

		if (x > x2) {
			x = x2; //move left if container overflows right edge
			this.$container.addClass('mtt-right-adjusted');
		}
		if (x < 0) {
			x = 0; //do not cross left edge
			this.$container.addClass('mtt-left-adjusted');
		}

		var y = offset.top + caller.offsetHeight - 1;
		if(y + this.$container.outerHeight(true) > $(window).height() + $(document).scrollTop()) y = offset.top - this.$container.outerHeight();
		if(y<0) y=0;

		this.$container.css({ position: 'absolute', top: y, left: x, width:this.$container.width() /*, 'min-width': $caller.width()*/ }).show();
		var menu = this;
		$(document).on('mousedown.mttmenu', function(e) { menu.close(e) });
		this.isOpen = true;
	};

	this.showSub = function()
	{
		// adjust width
		if (this.options.adjustWidth) {
			this.$container.width('');
			this.$container.removeClass('mtt-left-adjusted mtt-right-adjusted');
			if ( this.$container.outerWidth(true) > $(window).width() ) {
				this.$container.addClass('mtt-left-adjusted mtt-right-adjusted');
				this.$container.width( $(window).width() - (this.$container.outerWidth(true) - this.$container.width()) );
			}
		}

		//round the width to avoid overflow issues
		this.$container.width( Math.ceil(this.$container.width()) );

		this.$caller.addClass('mtt-menu-item-active');
		var offset = this.$caller.offset();
		var containerWidth = this.$container.outerWidth(true);

		var x = 0;
		if (this.options.isRTL) {
			x = offset.left - containerWidth - 1;
			if (x < 0) {
				x = offset.left + this.$caller.outerWidth();
			}
			if ( x + containerWidth > $(window).width() + $(document).scrollLeft() ) {
				x = $(window).width() + $(document).scrollLeft() - containerWidth; // TODO: rtl?
				this.$container.addClass('mtt-right-adjusted');
			}
		}
		else {
			x = offset.left + this.$caller.outerWidth();
			if ( x + containerWidth > $(window).width() + $(document).scrollLeft() ) { // TODO: rtl?
				x = offset.left - containerWidth - 1;
			}
			if (x < 0) {
				x = 0;
				this.$container.addClass('mtt-left-adjusted');
			}
		}

		var y = offset.top + this.parent.$container.offset().top-this.parent.$container.find('li:first').offset().top;
		if(y +  this.$container.outerHeight(true) > $(window).height() + $(document).scrollTop()) y = $(window).height() + $(document).scrollTop()- this.$container.outerHeight(true) - 1;
		if(y<0) y=0;

		this.$container.css({ position: 'absolute', top: y, left: x, width:this.$container.width() /*, 'min-width': this.$caller.outerWidth()*/ }).show();
		this.isOpen = true;
	};

	this.destroy = function()
	{
		for(var i in this.submenu) {
			this.submenu[i].destroy();
			delete this.submenu[i];
		}
		this.$container.find('li').unbind(); //'click mouseenter mouseleave'
	};
};


function taskContextMenu(el, id)
{
	if(!_mtt.menus.cmenu) _mtt.menus.cmenu = new mttMenu('taskcontextcontainer', {
		onclick: taskContextClick,
		beforeShow: function() {
			var taskId = this.tag;
			$('#taskrow_'+taskId).addClass('menu-active');
			$('#cmenupriocontainer li').removeClass('mtt-item-checked');
			$('#cmenu_prio\\:'+ taskList[taskId].prio).addClass('mtt-item-checked');
		},
		onClose: function() {
			$('#tasklist li').removeClass('menu-active');
		},
		alignRight: true
	});
	_mtt.menus.cmenu.tag = id;
	_mtt.menus.cmenu.show(el);
};

function taskContextClick(el, menu)
{
	if(!el.id) return;
	var taskId = parseInt(_mtt.menus.cmenu.tag);
	var id = el.id, value;
	var a = id.split(':');
	if(a.length == 2) {
		id = a[0];
		value = a[1];
	}
	switch(id) {
		case 'cmenu_edit': editTask(taskId); break;
		case 'cmenu_note': toggleTaskNote(taskId); break;
		case 'cmenu_delete': deleteTask(taskId); break;
		case 'cmenu_prio': setTaskPrio(taskId, parseInt(value)); break;
		case 'cmenu_list':
			if(menu.$caller && menu.$caller.attr('id')=='cmenu_move') moveTaskToList(taskId, value);
			break;
	}
};


function moveTaskToList(taskId, listId)
{
	if(curList.id == listId) return;
	_mtt.db.request('moveTask', {id:taskId, from:curList.id, to:listId}, function(json){
		if(!parseInt(json.total)) return;
		if(curList.id == -1)
		{
			// leave the task in current tab (all tasks tab)
			var item = json.list[0];
			changeTaskCnt(item, 0, taskList[item.id]);
			taskList[item.id] = item;
			var noteExpanded = (item.note != '' && $('#taskrow_'+item.id).is('.task-expanded')) ? 1 : 0;
			$('#taskrow_'+item.id).replaceWith(_mtt.prepareTaskStr(item, noteExpanded));
			if(curList.sort != 0) changeTaskOrder(item.id);
			refreshTaskCnt();
			$('#taskrow_'+item.id).effect("highlight", {color:_mtt.theme.editTaskFlashColor}, 'normal', function(){$(this).css('display','')});
		}
		else {
			// remove the task from currrent tab
			changeTaskCnt(taskList[taskId], -1)
			delete taskList[taskId];
			taskOrder.splice($.inArray(taskId,taskOrder), 1);
			$('#taskrow_'+taskId).fadeOut('normal', function(){ $(this).remove() });
			refreshTaskCnt();
		}
	});

	flag.tagsChanged = true;
};


function cmenuOnListsLoaded()
{
	if(_mtt.menus.cmenu) _mtt.menus.cmenu.destroy();
	_mtt.menus.cmenu = null;
	var s = '';
	var all = tabLists.getAll();
	for(var i in all) {
		s += '<li id="cmenu_list:'+all[i].id+'" class="'+(all[i].hidden?'mtt-list-hidden':'')+'">'+all[i].name+'</li>';
	}
	$('#cmenulistscontainer ul').html(s);
};

function cmenuOnListAdded(list)
{
	if(_mtt.menus.cmenu) _mtt.menus.cmenu.destroy();
	_mtt.menus.cmenu = null;
	$('#cmenulistscontainer ul').append('<li id="cmenu_list:'+list.id+'">'+list.name+'</li>');
};

function cmenuOnListRenamed(list)
{
	$('#cmenu_list\\:'+list.id).text(list.name);
};

function cmenuOnListSelected(list)
{
	$('#cmenulistscontainer li').removeClass('mtt-item-disabled');
	$('#cmenu_list\\:'+list.id).addClass('mtt-item-disabled').removeClass('mtt-list-hidden');
};

function cmenuOnListOrderChanged()
{
	cmenuOnListsLoaded();
	$('#cmenu_list\\:'+curList.id).addClass('mtt-item-disabled');
};

function cmenuOnListHidden(list)
{
	if (list.id == -1) return;
	$('#cmenu_list\\:'+list.id).addClass('mtt-list-hidden');
};


function tabmenuOnListSelected(list)
{
	if(list.published) {
		$('#btnPublish').addClass('mtt-item-checked');
		$('#btnRssFeed').removeClass('mtt-item-disabled');
	}
	else {
		$('#btnPublish').removeClass('mtt-item-checked');
		$('#btnRssFeed').addClass('mtt-item-disabled');
	}
	if(list.showCompl) $('#btnShowCompleted').addClass('mtt-item-checked');
	else $('#btnShowCompleted').removeClass('mtt-item-checked');
};


function listOrderChanged(event, ui)
{
	var a = $(this).sortable("toArray");
	var order = [];
	for(var i in a) {
		order.push(a[i].split('_')[1]);
	}
	tabLists.reorder(order);
	_mtt.db.request('changeListOrder', {order:order});
	_mtt.doAction('listOrderChanged', {order:order});
};

function showCompletedToggle()
{
	var act = curList.showCompl ? 0 : 1;
	curList.showCompl = tabLists.get(curList.id).showCompl = act;
	if(act) $('#btnShowCompleted').addClass('mtt-item-checked');
	else $('#btnShowCompleted').removeClass('mtt-item-checked');
	loadTasks({setCompl:1});
};

function clearCompleted()
{
	if (!curList) return false;
	mttConfirm( _mtt.lang.get('clearCompleted'), function()
	{
		_mtt.db.request('clearCompletedInList', {list:curList.id}, function(json){
			if(!parseInt(json.total)) return;
			flag.tagsChanged = true;
			if(curList.showCompl) loadTasks();
		});
	});
};

function showhide(a,b)
{
	a.show();
	b.hide();
};

function findParentNode(el, node)
{
	// in html nodename is in uppercase, in xhtml nodename in in lowercase
	if (el.nodeName.toUpperCase() == node) return el;
	while (el.parentNode) {
		el = el.parentNode;
		if (el.nodeName.toUpperCase() == node) return el;
	}
	return null;
};

function getLiTaskId(el)
{
	var li = findParentNode(el, 'LI');
	if(!li || !li.id) return 0;
	return li.id.split('_',2)[1];
};

function isParentId(el, id)
{
	if(el.id && $.inArray(el.id, id) != -1) return true;
	if(!el.parentNode) return null;
	return isParentId(el.parentNode, id);
};

function dehtml(str)
{
	return str.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
};


function slmenuOnListsLoaded()
{
	if(_mtt.menus.selectlist) {
		_mtt.menus.selectlist.destroy();
		_mtt.menus.selectlist = null;
	}

	var s = '';
	var all = tabLists.getAll();
	for(var i in all) {
		s += '<li id="slmenu_list:'+all[i].id+'" class="'+(all[i].id==curList.id?'mtt-item-checked':'')+' list-id-'+all[i].id+(all[i].hidden?' mtt-list-hidden':'')+'"><div class="menu-icon"></div><a href="'+ _mtt.urlForList(all[i])+ '">'+all[i].name+'</a></li>';
	}
	$('#slmenucontainer ul>.slmenu-lists-begin').nextAll().remove();
	$('#slmenucontainer ul>.slmenu-lists-begin').after(s);
};

function slmenuOnListRenamed(list)
{
	$('#slmenucontainer li.list-id-'+list.id).find('a').html(list.name);
};

function slmenuOnListAdded(list)
{
	if(_mtt.menus.selectlist) {
		_mtt.menus.selectlist.destroy();
		_mtt.menus.selectlist = null;
	}
	$('#slmenucontainer ul').append('<li id="slmenu_list:'+list.id+'" class="list-id-'+list.id+'"><div class="menu-icon"></div><a href="'+ _mtt.urlForList(list)+ '">'+list.name+'</a></li>');
};

function slmenuOnListSelected(list)
{
	$('#slmenucontainer li').removeClass('mtt-item-checked');
	$('#slmenucontainer li.list-id-'+list.id).addClass('mtt-item-checked').removeClass('mtt-list-hidden');

};

function slmenuOnListHidden(list)
{
	if (list.id == -1) return;
	$('#slmenucontainer li.list-id-'+list.id).addClass('mtt-list-hidden');
};

function slmenuSelect(el, menu)
{
	if(!el.id) return;
	var id = el.id, value;
	var a = id.split(':');
	if(a.length == 2) {
		id = a[0];
		value = a[1];
	}
	if(id == 'slmenu_list') {
		tabSelect(parseInt(value));
	}
	return false;
};

function hideList(listId)
{
	if (typeof listId === 'string') {
		listId = parseInt(listId);
	}
	else if (typeof listId !== 'number') {
		return;
	}

	if(!tabLists.get(listId)) return false;

	// if we hide current tab
	var listIdToSelect = 0;
	if(curList.id == listId) {
		var all = tabLists.getAll();
		for(var i in all) {
			if(all[i].id != curList.id && !all[i].hidden) {
				listIdToSelect = all[i].id;
				break;
			}
		}
		// do not hide the tab if others are hidden
		if(!listIdToSelect) return false;
	}

	if(listId == -1) {
		$('#list_all').addClass('mtt-tabs-hidden').removeClass('mtt-tabs-selected');
	}
	else {
		$('#list_'+listId).addClass('mtt-tabs-hidden').removeClass('mtt-tabs-selected');
	}

	tabLists.get(listId).hidden = true;

	_mtt.db.request('setHideList', {list:listId, hide:1});
	_mtt.doAction('listHidden', tabLists.get(listId));

	if(listIdToSelect) {
		tabSelect(listIdToSelect);
	}
}

/*
	Errors and Info messages
*/

function flashError(str, details)
{
	if (details === undefined) details = '';
	$("#msg>.msg-text").text(str)
	$("#msg>.msg-details").text(details);
	$("#loading").hide();
	$("#msg").addClass('mtt-error').effect("highlight", {color:_mtt.theme.msgFlashColor}, 700);
}

function flashInfo(str, details)
{
	if (details === undefined) details = '';
	$("#msg>.msg-text").text(str)
	$("#msg>.msg-details").text(details);
	$("#loading").hide();
	$("#msg").addClass('mtt-info').effect("highlight", {color:_mtt.theme.msgFlashColor}, 700);
}

function toggleMsgDetails()
{
	var el = $("#msg>.msg-details");
	if(!el) return;
	if(el.css('display') == 'none') el.show();
	else el.hide()
}


/*
	Authorization
*/
function updateAccessStatus()
{
	// flag.needAuth is not changed after pageload
	if(flag.needAuth)
	{
		if (flag.isLogged) {
			showhide( $("#bar_logout"), $("#bar_login") );
		}
		else {
			showhide( $("#bar_login"), $("#bar_logout") );
		}
	}
	else {
		$('#mtt_body').addClass('no-need-auth');
	}
	if(flag.needAuth && !flag.isLogged) {
		flag.readOnly = true;
		$("#bar_public").show();
		$('#mtt_body').addClass('readonly')
		liveSearchToggle(1);
		// remove some tab menu items
		$('#btnRenameList,#btnDeleteList,#btnClearCompleted,#btnPublish').remove();
	}
	else {
		flag.readOnly = false;
		$('#mtt_body').removeClass('readonly')
		$("#bar_public").hide();
		liveSearchToggle(0);
	}
	$('#page_ajax').hide();
}

function showAuth(el)
{
	var w = $('#authform');
	if(w.css('display') == 'none')
	{
		var offset = $(el).offset();
		w.css({
			position: 'absolute',
			top: offset.top + el.offsetHeight + 3,
			left: offset.left + el.offsetWidth - w.outerWidth()
		}).show();
		$('#password').focus();
	}
	else {
		w.hide();
		el.blur();
	}
}

function doAuth(form)
{
	$.post(mytinytodo.mttUrl+'ajax.php?login', { login:1, password: form.password.value }, function(json){
		form.password.value = '';
		if(json.logged)
		{
			flag.isLogged = true;
			window.location.reload();
		}
		else {
			flashError(_mtt.lang.get('invalidpass'));
			$('#password').focus();
		}
	}, 'json');
	$('#authform').hide();
}

function logout()
{
	$.post(mytinytodo.mttUrl+'ajax.php?logout', { logout:1 }, function(json){
		flag.isLogged = false;
		window.location.reload();
	}, 'json');
	return false;
}


/*
	Settings
*/

function showSettings()
{
	if(_mtt.pages.current.page == 'ajax' && _mtt.pages.current.pageClass == 'settings') return false;
	$('#page_ajax').load(_mtt.mttUrl+'settings.php?ajax=yes',null,function(){
		//showhide($('#page_ajax').addClass('mtt-page-settings'), $('#page_tasks'));
		_mtt.pageSet('ajax','settings');
	})
	return false;
}

function saveSettings(frm)
{
	if(!frm) return false;
	var params = { save:'ajax' };
	$(frm).find("input:text,input:password,input:checked,select").filter(":enabled").each(function() { params[this.name || '__'] = this.value; });
	$(frm).find(":submit").attr('disabled','disabled').blur();
	$.post(_mtt.mttUrl+'settings.php', params, function(json){
		if(json.saved) {
			flashInfo(_mtt.lang.get('settingsSaved'));
			setTimeout( function(){
				window.location.assign(_mtt.homeUrl); //window.location.reload();
			}, 1000);
		}
	}, 'json');
}


/*
 *	Dialogs
 */

function mttConfirm(msg, callbackOk, callbackCancel)
{
	var r = confirm(msg);
	if (r) {
		if (typeof callbackOk === 'function')
			callbackOk();
	}
	else {
		if (typeof callbackCancel === 'function')
			callbackCancel();
	}
}

function mttPrompt(msg, defaultValue, callbackOk, callbackCancel)
{
	var r = prompt(msg, defaultValue);
	if (r !== null) {
		if (typeof callbackOk === 'function')
			callbackOk(r);
	}
	else {
		if (typeof callbackCancel === 'function')
			callbackCancel();
	}
}


/*
 *	History and Hash change
 */
function historyListSelected(list)
{
	if (flag.historySkip) {
		flag.historySkip = false;
		return;
	}

	if (flag.firstLoad) {
		history.replaceState( { list:list.id }, document.title, _mtt.urlForList(list))
	}
	else {
		history.pushState( { list:list.id }, document.title, _mtt.urlForList(list));
	}
}


function historyOnPopState(event)
{
	if (event.state && event.state.list) {
		flag.historySkip = true;
		tabSelect(event.state.list);
	}
}


})();
