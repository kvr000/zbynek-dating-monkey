// ==UserScript==
// @id          https://github.com/kvr000/zbynek-okcupid-util/ZbynekOkcupidQuestionFilter/
// @name        Zbynek Okcupid Question Filter
// @namespace   https://github.com/kvr000/zbynek-okcupid-util/
// @description Okcupid - organize question according to defined priorities
// @author      Zbynek Vyskovsky, kvr000@gmail.com https://github.com/kvr000/
// @copyright   2020+, Zbynek Vyskovsky,kvr000@gmail.com (https://github.com/kvr000/zbynek-okcupid-util/)
// @license     Apache-2.0
// @homepage    https://github.com/kvr000/zbynek-okcupid-util/
// @homepageURL https://github.com/kvr000/zbynek-okcupid-util/
// @downloadURL https://raw.githubusercontent.com/kvr000/zbynek-okcupid-util/master/ZbynekOkcupidQuestionFilter/ZbynekOkcupidQuestionFilter.user.js
// @updateURL   https://raw.githubusercontent.com/kvr000/zbynek-okcupid-util/master/ZbynekOkcupidQuestionFilter/ZbynekOkcupidQuestionFilter.user.js
// @supportURL  https://github.com/kvr000/zbynek-okcupid-util/issues/
// @contributionURL https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=J778VRUGJRZRG&item_name=Support+features+development.&currency_code=CAD&source=url
// @version     1.0.0
// @grant       GM_log
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @include     /^https?://(?:www\.)?okcupid\.com/.*/
// @require     https://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min.js
// @run-at      document-idle
// ==/UserScript==

/*jshint loopfunc:true */

(function() {
	'use strict';
	let $ = window.jQuery;

	let unwanted;
	try {
		unwanted = JSON.parse(window.localStorage.getItem('ZbynekStravaClubFilterUnwanted.unwantedAthletes')) || {};
	}
	catch (err) {
		GM_log(err);
		unwanted = {};
	}

	class Js
	{
		static undefinedElse(value, defaultValue)
		{
			return value === undefined ? defaultValue : value;
		}

		static undefinedElseGet(value, supplier)
		{
			return value === undefined ? supplier() : value;
		}

		static undefinedElseThrow(value, exceptionSupplier)
		{
			if (value === undefined)
				throw exceptionSupplier();
			return value;
		}

		static nullElse(value, defaultValue)
		{
			return value == null ? defaultValue : value;
		}

		static nullElseGet(value, supplier)
		{
			return value == null ? supplier() : value;
		}

		static nullElseThrow(value, exceptionSupplier)
		{
			if (value == null)
				throw exceptionSupplier();
			return value;
		}

		static objGetElse(obj, key, defaultValue)
		{
			return key in obj ? obj[key] : defaultValue;
		}

		static objGetElseGet(obj, key, supplier)
		{
			return key in obj ? obj[key] : supplier(key);
		}

		static objGetElseThrow(obj, key, exceptionSupplier)
		{
			if (key in obj)
				return obj[key];
			throw exceptionSupplier(key);
		}

		static strEmptyToNull(str)
		{
			return str === "" ? null : str;
		}

		static strValueToNull(nullvalue, str)
		{
			return str === nullvalue ? null : str;
		}

		static strNullToEmpty(str)
		{
			return str === "" ? null : str;
		}

		static regexValueToNull(regex, str)
		{
			return str == null || regex.test(str) ? null : str;
		}

		static objMap(obj, mapper)
		{
			return obj == null ? null : mapper(obj);
		}

		static escapeRegExp(string) {
			return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}
	}

	class AbstractCache
	{
		constructor(version, expiration)
		{
			this.version = version;
			this.expiration = expiration;
			this.pendingPromises = {};
		}

		promiseIfAbsent(id, resolver)
		{
			const item = this.get(id);
			if (!item) {
				let promise = this.pendingPromises[id];
				if (promise == null) {
					promise = this.pendingPromises[id] = resolver(id);
				}
				return promise.then(
					(result) => { delete this.pendingPromises[id]; this.put(id, result); return result; },
					(error) => { delete this.pendingPromises[id]; throw error; }
				);
			}
			return Promise.resolve(item);
		}

	}

	class GlobalDbStorageCache extends AbstractCache
	{
		constructor(storage, name, version, expiration, options)
		{
			super(version, expiration);
			this.storage = storage;
			this.name = name;
			this.writebackTimeout = Js.objGetElse(options || {}, 'writebackTimeout', 5000);
			this.itemsToUpdate = {};
			this.pendingWrite = false;
			this.loadDb();
		}

		get(id)
		{
			const item = this.cache[id];
			if (item) {
				if (item.version == this.version && (item.expire == null || item.expire > new Date().getTime())) {
					return item.value;
				}
				delete this.cache[id];
				this.itemsToUpdate[id] = null;
				this.scheduleUpdate();
			}
			return null;
		}

		put(id, value)
		{
			this.itemsToUpdate[id] = this.cache[id] = { expire: this.expiration == null ? null : new Date().getTime()+this.expiration, version: this.version, value: value };
			this.scheduleUpdate();
		}

		scheduleUpdate()
		{
			if (!this.pendingWrite) {
				setTimeout(() => this.doUpdate(), this.writebackTimeout);
				this.pendingWrite = true;
			}
		}

		doUpdate()
		{
			this.loadDb();
			Object.getOwnPropertyNames(this.itemsToUpdate).forEach((key) => {
				if (this.itemsToUpdate[key] !== null) {
				       	this.cache[key] = this.itemsToUpdate[key];
				}
				else {
					delete this.cache[key];
				}
			});
			this.itemsToUpdate = {};
			this.storage.setItem(this.name, JSON.stringify(this.cache));
			this.pendingWrite = false;
		}

		dump()
		{
			return JSON.stringify(this.cache, null, "\t");
		}

		import(dump)
		{
			this.cache = JSON.parse(dump);
			this.itemsToUpdate = {};
			this.storage.setItem(this.name, JSON.stringify(this.cache));
			this.pendingWrite = false;
		}

		loadDb()
		{
			try {
				this.cache = JSON.parse(this.storage.getItem(this.name));
				const time = new Date().getTime();
				Object.getOwnPropertyNames(this.cache).forEach((id) => {
					const value = this.cache[id];
					if (value.expire != null && time >= value.expire) {
						delete this.cache[id];
					}
				});
			}
			catch (err) {
			}
			if (!this.cache) {
				this.cache = {};
			}
		}

	}

	class GmAjaxService
	{
		execute(method, url, options = null, data = null)
		{
			return new Promise((resolve, reject) => {
				try {
					const fullOptions = Object.assign(
						{
							method,
							url,
						},
						options || {},
						{
							onload: (response) => response.status == 200 ? resolve(response.responseText) : reject("Failed "+method+" "+url+" : "+response.status+" "+response.statusText),
							onerror: reject,
							ontimeout: reject,
						}
					);
					GM_xmlhttpRequest(fullOptions);
				}
				catch (err) {
					reject(err);
				}
			});
		}

		executeTemplate(method, urlTemplate, placeholders, options = null, data = null)
		{
			const url = this.convertTemplate(urlTemplate, placeholders);
			return this.execute(method, url, options, data);
		}

		get(url, options = null)
		{
			return this.execute("GET", url, options);
		}

		getTemplate(urlTemplate, placeholders, options = null)
		{
			return this.executeTemplate("GET", urlTemplate, placeholders, options);
		}

		convertTemplate(urlTemplate, placeholders)
		{
			return urlTemplate.replace(/{([^}]+)}/g, (full, group1) => encodeURIComponent(Js.objGetElseThrow(placeholders, group1, (group1) => new Error("Undefined placeholder: "+group1))));
		}
	}

	class HtmlWrapper
	{
		constructor(doc)
		{
			this.doc = doc;
		}

		evaluate(...args)
		{
			return this.doc.evaluate(...args);
		}

		findXpathNode(xpath, start)
		{
			return this.doc.evaluate(xpath, start, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
		}

		needXpathNode(xpath, start)
		{
			let node;
			if ((node = this.doc.evaluate(xpath, start, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue) != null) {
				return node;
			}
			throw new Error("Cannot find node: " + xpath);
		}

		needXpathString(xpath, start)
		{
			let node;
			if ((node = this.doc.evaluate(xpath, start, null, XPathResult.STRING_TYPE).stringValue) != null) {
				return node;
			}
			throw new Error("Cannot find node: " + xpath);
		}

		listXpath(xpath, start)
		{
			const elements = [];
			for (let xpathOut = this.doc.evaluate(xpath, start), el = null; (el = xpathOut.iterateNext()); ) {
				elements.push(el);
			}
			return elements;
		}

		removeXpath(xpath, start)
		{
			this.listXpath(xpath, start).forEach((node) => node.remove());
		}

		insertAfter(inserted, before)
		{
			before.parentNode.insertBefore(inserted, before.nextSibling);
		}

		insertMultiBefore(inserted, after)
		{
			inserted.forEach((e) => after.parentElement.insertBefore(e, after));
		}

		insertMultiAfter(inserted, before)
		{
			let last = before;
			inserted.forEach((e) => { this.insertAfter(e, before); before = e; });
		}

		appendMulti(inserted, parentElement)
		{
			inserted.forEach((e) => parentElement.appendChild(e));
		}

		childElementPosition(child)
		{
			let i = 0;
			for (let left = child; (left = left.previousElementSibling) != null; ++i) ;
			return i;
		}

		nextMatchingElementSibling(element, predicate)
		{
			let n;
			for (n = element.nextElementSibling; n != null && !predicate(n); n = n.nextElementSibling) ;
			return n;
		}

		previousMatchingElementSibling(element, predicate)
		{
			let p;
			for (p = element.previousElementSibling; p != null && !predicate(p); p = p.previousElementSibling) ;
			return p;
		}

		createElementEx(name, attrs, children)
		{
			const element = this.doc.createElement(name);
			if (attrs) {
				Object.getOwnPropertyNames(attrs).forEach((k) => { const v = attrs[k]; if (k === 'class') element.setAttribute(k, v); else element[k] = v; });
			}
			if (children) {
				if (!Array.isArray(children)) { throw new Error("Passed non-array as children object: "+children); }
				children.forEach(v => element.appendChild(v));
			}
			return element;
		}

		createElementWithText(name, attrs, text)
		{
			return this.createElementEx(name, attrs, [
				this.createTextNode(text)
			]);
		}

		createTextNode(text)
		{
			return this.doc.createTextNode(text);
		}

		createSelect(attrs, options, current, listener)
		{
			const optionsElements = [];
			$.each(options, (k, v) => optionsElements.push(v instanceof Node ?
			       	this.createElementEx("option", { value: k }, [ v ]) :
				this.createElementWithText("option", { value: k }, v)
			));
			const element = this.createElementEx("select", attrs, optionsElements);
			element.value = current == null && attrs.emptyIsNull ? "" : String(current);
			element.updateListener = listener;
			element.onchange = (event) => { event.target.updateListener(event.target.value == "" && event.target.emptyIsNull ? null : event.target.value) };
			return element;
		}

		templateElement(html, placeholders, prefix = 'pl$-')
		{
			const elements = this.templateElements(html, placeholders, prefix);
			if (elements.length != 1) {
				throw Error("Template resulted into multiple elements: ", elements);
			}
			return elements[0];
		}

		templateElements(html, placeholders, prefix = 'pl$-')
		{
			const elements = $.parseHTML(html);
			for (let i = 0; i < elements.length; ++i) {
				let current = elements[i];
				if (!(current instanceof Element))
					continue;
				while (current != null) {
					if (current.localName.startsWith(prefix)) {
						const command = current.localName.substring(prefix.length);
						switch (command) {
							case 'text':
							case 'textrun': {
								if (current.firstChild != null)
									throw new Error("Replacement node contains unexpected subelements: "+current);
								const textName = Js.nullElseThrow(current.getAttribute("name"), () => new Error("Cannot find name attribute in element: "+current));
								const providedText = Js.objGetElseThrow(placeholders, textName, () => new Error("Cannot find placeholder: "+textName));
								const node = current.parentNode.insertBefore(this.doc.createTextNode(command == 'textrun' ? providedText(current, this) : providedText), current);
								const old = current;
								current = node;
								old.remove();
								break;
							}

							case 'node':
							case 'noderun': {
								if (current.firstChild != null)
									throw new Error("Replacement node contains unexpected subelements: "+current);
								const nodeName = Js.nullElseThrow(current.getAttribute("name"), () => new Error("Cannot find name attribute in element: "+current));
								const providedNode = Js.objGetElseThrow(placeholders, nodeName, () => new Error("Cannot find placeholder: "+nodeName));
								const node = current.parentNode.insertBefore(command == 'noderun' ? providedNode(current, this) : providedNode, current);
								const old = current;
								current = node;
								old.remove();
								break;
							}

							case 'if':
							case 'ifrun': {
								let trueEl;
								let falseEl;
								if (current.firstElementChild == null || current.firstElementChild.nextSibling == null || current.firstElementChild.nextSibling.nextSibling != null) {
									throw new Error("Expected exactly two elements of if block, true and false: "+current);
								}
								if (current.firstElementChild.localName == 'true') {
									trueEl = current.firstElementChild;
									if (trueEl.nextSibling.localName != 'false')
										throw new Error("Expected false block, got "+trueEl.nextSibling);
									falseEl = trueEl.nextSibling;
								}
								else if (current.firstElementChild.localName == 'false') {
									falseEl = current.firstElementChild;
									if (falseEl.nextSibling.localName != 'true')
										throw new Error("Expected false block, got "+falseEl.nextSibling);
									trueEl = trueEl.nextSibling;
								}
								const conditionName = Js.nullElseThrow(current.getAttribute("condition"), () => new Error("Cannot find condition attribute in element: "+current));
								const condition = Js.objGetElseThrow(placeholders, conditionName, () => new Error("Cannot find placeholder: "+conditionName));
								const chosen = (command == 'ifrun' ? condition(current, this) : condition) ? trueEl : falseEl;
								let restart = chosen.firstElementChild;
								while (chosen.firstChild) {
									const next = chosen.firstChild;
									current.parentNode.insertBefore(next, current);
								}
								if (restart == null) {
									restart = current;
									do {
										if (restart.nextElementSibling != null) {
											restart = restart.nextElementSibling;
											break;
										}
										restart = restart.parentElement;
									} while (restart != null);
								}
								current.remove();
								current = restart;
								continue;
							}

							default:
								throw new Error("Unexpected element: "+current);
						}
					}
					else {
						if (current.attributes.length != 0) {
							const names = [];
							for (let i = 0; i < current.attributes.length; ++i) {
								names.push(current.attributes[i].name);
							}
							names.forEach((name) => {
								if (name.startsWith(prefix)) {
									const placeholder = current.getAttribute(name);
									current[name.substring(prefix.length)] =  Js.objGetElseThrow(placeholders, placeholder, () => new Error("Cannot find placeholder: "+placeholder));
									current.removeAttribute(name);
								}
							});
						}
						if (current.firstElementChild != null) {
							current = current.firstElementChild;
							continue;
						}
					}
					do {
						if (current.nextElementSibling != null) {
							current = current.nextElementSibling;
							break;
						}
						current = current.parentElement;
					} while (current != null);
				}
			}
			return elements;
		}

		setVisible(element, isVisible, visibilityType = 'block')
		{
			element.style.display = isVisible ? visibilityType : 'none';
			return isVisible;
		}

	}

	/**
	 * UI for Activity UI
	 */
	class ZbynekOkcupidQuestionPriorityUi
	{
		settingsDb;

		dwrapper;

		donateUrl = "https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=J778VRUGJRZRG&item_name=Support+future+development.&currency_code=CAD&source=url";

		questionPriorities;

		bodyEl;
		bodyObserver;
		questionsEl;
		questionsObserver;
		settingsEl;

		constructor(settingsDb, dwrapper)
		{
			this.settingsDb = settingsDb;
			this.dwrapper = dwrapper;
		}

		init()
		{
			this.initializeStatic();
			this.initializeUi();
		}

		initializeStatic()
		{
			GM_addStyle(
					".zbynek-okcupid-questions-priority-settings { }\n"+
					".zbynek-okcupid-questions-priority-settings .import-settings-dialog { }\n"+
					".zbynek-okcupid-questions-priority-settings .export-settings { }\n"+
					".zbynek-okcupid-questions-priority-button { }\n"+
					".zbynek-okcupid-questions-priority-button .updowndel { }"+
					".zbynek-okcupid-questions-priority-button .rankind { }"+
					".zbynek-okcupid-questions-priority-button .priority { }"
				   );
		}

		initializeUi()
		{
			this.listenBody();
		}

		reloadQuestionPriorities()
		{
			let savedPriorities = this.settingsDb.get("questionPriorities") || {};
			this.questionPriorities = {};

			(savedPriorities.upranked || []).forEach((name, i) => this.questionPriorities[name] = i+1);
			(savedPriorities.downranked || []).forEach((name, i) => this.questionPriorities[name] = -i-1);
		}

		listenBody()
		{
			if (this.questionsObserver) {
				this.questionsObserver.disconnect();
				this.questionsObserver = null;
			}
			this.bodyEl = this.dwrapper.needXpathNode("/html/body", this.dwrapper.doc);
			this.questionsEl = null;
			this.bodyObserver = new MutationObserver(() => this.bodyUpdated());
			this.bodyObserver.observe(this.bodyEl, { attributes: false, childList: true, subtree: true });
		}

		bodyUpdated()
		{
			if (this.questionsEl != null) {
				if (!this.bodyEl.contains(this.questionsEl)) {
					this.questionsEl = null;
					this.questionsObserver.disconnect();
					this.questionsObserver = null;
				}
			}
			if (this.questionsEl == null) {
				if ((this.questionsEl = this.dwrapper.findXpathNode("//*[contains(concat(' ', @class, ' '), ' profile-questions ')]", this.dwrapper.doc)) == null) {
					return;
				}
				if (this.questionsEl) {
					this.questionsObserver = new MutationObserver(() => this.updateQuestions());
					this.questionsObserver.observe(this.questionsEl, { attributes: false, childList: true, subtree: false });
					this.updateQuestions();
				}
			}
			if (this.settingsEl != null) {
				if (!this.bodyEl.contains(this.settingsEl)) {
					this.settingsEl = null;
				}
			}
			if (this.settingsEl == null) {
				let leftMenuEl = this.dwrapper.findXpathNode("//div[contains(concat(' ', @class, ' '), 'profile-questions-sidebar')]", this.dwrapper.doc);
				if (leftMenuEl == null) {
					return;
				}
				this.settingsEl = this.dwrapper.templateElement(
					""+
						"<div>\n"+
						"	<ul class='zbynek-okcupid-questions-priority-settings'>\n"+
						"		<li>Zbynek Okcupid Settings</li>\n"+
						"		<li>\n"+
						"			<a pl$-onclick='importSettingsFunc'>Import Settings</a>\n"+
						"			<div class='import-settings-dialog' zIndex='32768' style='display: none;'>\n"+
						"				<textarea placeholder='Paste the dump here' rows='80' cols='20'></textarea>\n"+
						"				<button pl$-onclick='importSettingsSubmitFunc'>Ok</button>\n"+
						"			</div>\n"+
						"		</li>\n"+
						"		<li><a pl$-onclick='exportSettingsFunc'>Export Settings</a></li>\n"+
						"		<li><a pl$-href='donateUrl' target='_blank' title='Support further development by donating to project'>Donate to development</a></li>\n"+
						"	</ul>\n"+
						"</div>",
					{
						enrichSegmentsFunc: (event) => this.enrichSegments(),
						importSettingsFunc: (event) =>
							this.importSettings(
								this.dwrapper.needXpathNode("..//*[@class = 'import-settings-dialog']", event.currentTarget, null, XPathResult.FIRST_ORDERED_NODE_TYPE),
								this.dwrapper.needXpathNode("..//*[@class = 'import-settings-dialog']//textarea", event.currentTarget, null, XPathResult.FIRST_ORDERED_NODE_TYPE)
							),
						importSettingsSubmitFunc: (event) =>
							this.dwrapper.evaluate("..//textarea", event.currentTarget, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue.confirmHandler(),
						exportSettingsFunc: () => this.exportSettings(),
						donateUrl: this.donateUrl,
					},
					"pl$-"
				);
				leftMenuEl.append(this.settingsEl);
			}
		}

		updateQuestions()
		{
			GM_log("questions updated");
			const questions = this.dwrapper.listXpath("./*[contains(concat(' ', @class, ' '), 'profile-question')]", this.questionsEl);
			for (let i = 0; i < questions.length; ++i) {
				let questionEl = questions[i];
				let extensionButton = this.dwrapper.findXpathNode("./button[@class = 'zbynek-okcupid-questions-priority-button']", questionEl);
				if (extensionButton == null) {
					extensionButton = this.dwrapper.templateElement(
						""+
							"<button class='zbynek-okcupid-questions-priority-button'>\n"+
							"	<span pl$-onclick='upHandler' class='updowndel'>⇧</span>\n"+
							"	<span pl$-onclick='downHandler' class='updowndel'>⇩</span>\n"+
							"	<span pl$-onclick='removeHandler' class='updowndel'>✖</span>\n"+
							"	<span class='rankind'></span>\n"+
							"</button>"+
							"",
						{
							upHandler: (event) => this.upQuestion(event),
							downHandler: (event) => this.downQuestion(event),
							removeHandler: (event) => this.removeQuestion(event),
						},
						"pl$-"
					);
					questionEl.appendChild(extensionButton);
					this.rehiearchizeQuestion(questionEl, null);
				}
			}
		}

		importSettings(dialog, input)
		{
			dialog.style.display = 'block';
			input.confirmHandler = () => {
				try {
					this.settingsDb.import(input.value);
					this.reloadQuestionPriorities();
					const questions = this.dwrapper.listXpath("./*[contains(concat(' ', @class, ' '), ' profile-question ') and not contains(concat(' ', @class, ' '), ' isLoading ')]", this.questionsEl);
					for (let i = 0; i < questions.length; ++i) {
						let questionEl = questions[i];
						let extensionButton = this.dwrapper.findXpathNode("./button[@class = 'zbynek-okcupid-questions-priority-button']", questionEl);
						if (extensionButton) {
							extensionButton.remove();
						}
					}
					this.updateQuestions();
				}
				catch (err) {
					alert("Failed to parse data from clipboard, please make sure you copied preference dump correctly: "+err);
				}
				dialog.style.display = 'none';
			}
		}

		exportSettings()
		{
			GM_setClipboard(this.settingsDb.dump());
			alert("Preference dump was copied into clipboard");
		}

		findQuestionPriority(questionContent)
		{
			if (!this.questionPriorities) {
				this.reloadQuestionPriorities();
			}
			return this.questionPriorities[questionContent] || 0;
		}

		removeOldPriority(prio)
		{
			for (let x in this.questionPriorities) {
				if (this.questionPriorities[x] == prio) {
					delete this.questionPriorities[x];
				}
				if ((prio > 0 && this.questionPriorities[x] > prio) || (prio < 0 && this.questionPriorities[x] < prio)) {
					this.questionPriorities[x] -= prio > 0 ? 1 : -1;
				}
			}
		}

		insertNewPriority(key, prio)
		{
			let min = 0, max = 0;
			for (let x in this.questionPriorities) {
				if ((prio > 0 && this.questionPriorities[x] >= prio) || (prio < 0 && this.questionPriorities[x] <= prio)) {
					if (prio > 0) {
						max = Math.max(max, ++this.questionPriorities[x]);
					}
					else {
						min = Math.min(min, --this.questionPriorities[x]);
					}
				}
			}
			this.questionPriorities[key] = prio > 0 ? (prio > max+1 ? max+1 : prio) : (prio < min-1 ? min-1 : prio);
		}

		updateQuestionPriority(questionContent, priorityChange)
		{
			// this is super underoptimal but we can afford it, given amount of updates:
			this.reloadQuestionPriorities();
			let oldPrio = this.findQuestionPriority(questionContent);
			let newPrio = priorityChange != 0 ? oldPrio+priorityChange : 0;
			this.removeOldPriority(oldPrio);
			if (newPrio != 0) {
				this.insertNewPriority(questionContent, newPrio);
			}

			let savedPriorities = {
				upranked: [],
				downranked: [],
			};
			for (const [ k, v ] of Object.entries(this.questionPriorities)) {
				if (v > 0) {
					savedPriorities.upranked[v-1] = k;
				}
				else {
					savedPriorities.downranked[-v-1] = k;
				}
			}
			this.settingsDb.put("questionPriorities", savedPriorities);
			return newPrio;
		}

		readQuestionContent(questionEl)
		{
			return this.dwrapper.needXpathString(".//*[@class = 'profile-question-text']/text()", questionEl);
		}

		readQuestionElement(questionEl)
		{
			return {
				element: questionEl,
				rankInd: this.dwrapper.needXpathNode(".//button[@class = 'zbynek-okcupid-questions-priority-button']/span[@class = 'rankind']", questionEl),
				content: this.readQuestionContent(questionEl),
			};
		}

		comparePriorities(pl, pr)
		{
			return pr-pl;
		}

		isQuestionPredicate(el)
		{
			return el.classList.contains("profile-question");
		}

		rehiearchizeQuestion(questionEl, priorityChange)
		{
			let q = this.readQuestionElement(questionEl);
			let newPrio = priorityChange === null ? this.findQuestionPriority(q.content) : this.updateQuestionPriority(q.content, priorityChange);
			{
				let p;
				for (p = this.dwrapper.previousMatchingElementSibling(questionEl, this.isQuestionPredicate); p != null && this.comparePriorities(this.findQuestionPriority(this.readQuestionContent(p)), newPrio) > 0; p = this.dwrapper.previousMatchingElementSibling(p, this.isQuestionPredicate)) ;
				if (p != this.dwrapper.previousMatchingElementSibling(questionEl, this.isQuestionPredicate)) {
					const parent = questionEl.parentElement;
					parent.removeChild(questionEl);
					if (p == null) {
						parent.insertBefore(questionEl, parent.firstElementChild);
					}
					else {
						this.dwrapper.insertAfter(questionEl, p);
					}
				}
			}
			{
				let n;
				for (n = this.dwrapper.nextMatchingElementSibling(questionEl, this.isQuestionPredicate); n != null && this.comparePriorities(this.findQuestionPriority(this.readQuestionContent(n)), newPrio) < 0; n = this.dwrapper.nextMatchingElementSibling(n, this.isQuestionPredicate)) ;
				if (n != this.dwrapper.nextMatchingElementSibling(questionEl, this.isQuestionPredicate)) {
					const parent = questionEl.parentElement;
					parent.removeChild(questionEl);
					parent.insertBefore(questionEl, n);
				}
			}
			q.rankInd.textContent = newPrio != 0 ? newPrio > 0 ? "upranked" : "downranked" : "not-ranked";
		}

		eventRehiearchizeQuestion(event, priorityChange)
		{
			const questionEl = this.dwrapper.needXpathNode("ancestor::*[contains(concat(' ', @class, ' '), ' profile-question ')]", event.currentTarget);
			this.rehiearchizeQuestion(questionEl, priorityChange);
		}

		upQuestion(event)
		{
			this.eventRehiearchizeQuestion(event, +1);
		}

		downQuestion(event)
		{
			this.eventRehiearchizeQuestion(event, -1);
		}

		removeQuestion(event)
		{
			this.eventRehiearchizeQuestion(event, 0);
		}
	}

	if (true /* /^\/profile\/\d+\/questions\/?$/.test(window.location.pathname) */) {
		new ZbynekOkcupidQuestionPriorityUi(
			new GlobalDbStorageCache(window.localStorage, "ZbynekOkcupidInfo.questionPriority", 1, null),
			new HtmlWrapper(document)
		)
			.init();
	}
	else {
		GM_log("Failed to match URL to known pattern, ignoring: "+window.location.pathname);
	}

})();
