/**
 * paste.js is part of Aloha Editor project http://aloha-editor.org
 *
 * Aloha Editor is a WYSIWYG HTML5 inline editing library and editor.
 * Copyright (c) 2010-2014 Gentics Software GmbH, Vienna, Austria.
 * Contributors http://aloha-editor.org/contribution.php
 */
define([
	'editing',
	'arrays',
	'events',
	'boundaries',
	'dom',
	'content',
	'functions',
	'html',
	'mutation',
	'ranges',
	'undo',
	'transform/ms-word',
	'transform',
	'selections'
], function (
	Editing,
	Arrays,
	Events,
	Boundaries,
	Dom,
	Content,
	Fn,
	Html,
	Mutation,
    Ranges,
    Undo,
    WordTransform,
    Transform,
	Selections
) {
	'use strict';

	var Mime = {
		plaintext : 'text/plain',
		html      : 'text/html'
	};

	/**
	 * Checks if the given event is a Paste Event.
	 *
	 * @param  {Event} event
	 * @return {boolean}
	 */
	function isPasteEvent(event) {
		return event.type === 'paste' || event.clipboardData !== undefined;
	}

	/**
	 * Checks the content type of `event`.
	 *
	 * @param  {Event}  event
	 * @param  {string} type
	 * @return {boolean}
	 */
	function holds(event, type) {
		return Arrays.contains(event.clipboardData.types, type);
	}

	/**
	 * Gets content of the paste data that matches the given mime type.
	 *
	 * @param  {Event}  event
	 * @param  {string} type
	 * @return {string}
	 */
	function getData(event, type) {
		return event.clipboardData.getData(type);
	}

	function split(boundary, until) {
		var range = Ranges.fromBoundaries(boundary, boundary);
		Editing.split(range);
		return Boundaries.fromRangeStart(range);
	}

	function delete_(boundaries) {
		var range = Ranges.fromBoundaries(boundaries[0], boundaries[1]);
		Editing.delete(range, {overrides:[]});
		return Boundaries.fromRangeStart(range);
	}

	function allowsNesting(outer, inner) {
		return Content.allowsNesting(outer.nodeName, inner.nodeName);
	}

	function moveBeforeBoundary(boundary, node) {
		return Mutation.insertNodeAtBoundary(node, boundary, true);
	}

	/**
	 * Pastes the markup at the given boundary range.
	 *
	 * @param  {Array.<Boundary>} boundaries
	 * @param  {string}
	 * @return {Boundary}
	 */
	function insert(boundaries, markup) {
		var doc = Boundaries.container(boundaries[0]).ownerDocument;
		var boundary = delete_(boundaries);
		var element = Html.parse(markup, doc);
		var children = Dom.children(element);

		if (0 === children.length) {
			return boundary;
		}

		// Because we want to treat the paste content as though it were already
		// editable
		Dom.setAttr(element, 'contentEditable', true);

		var first = children[0];

		// Because (unlike plaintext), pasted html will contain an unintended
		// linebreak caused by the wrapper in which the pasted content is
		// contained (P in most cases). We therefore unfold this wrapper
		// whenever is is valid to do so
		if (!Dom.isTextNode(first) && !Html.isVoidType(first) && !Html.isGroupContainer(first)) {
			children = Dom.children(first).concat(children.slice(1));
		}

		if (0 === children.length) {
			return boundary;
		}

		children.forEach(function (node) {
			if (Html.hasLinebreakingStyle(node)) {
				boundary = split(boundary, Fn.partial(allowsNesting, node));
			}
			boundary = Mutation.insertNodeAtBoundary(node, boundary, true);
		});

		var last = Arrays.last(children);

		if ('P' === last.nodeName || 'DIV' === last.nodeName) {
			var next = Boundaries.nextNode(boundary);
			if (Html.hasInlineStyle(next)) {
				Dom.move(Dom.nextSiblings(next, Html.hasLinebreakingStyle), last);
			} else if (!Html.isVoidType(next) && !Html.isGroupContainer(next)) {
				boundary = Dom.children(last).reduce(moveBeforeBoundary, Boundaries.create(next, 0));
				Dom.remove(last);
			}
		}

		return boundary;
	}

	/**
	 * Extracts the paste data from the event object.
	 *
	 * @param  {Event}    event
	 * @param  {Document} doc
	 * @return {string}
	 */
	function extractContent(event, doc) {
		if (holds(event, Mime.html)) {
			var content = getData(event, Mime.html);
			return WordTransform.isMSWordContent(content, doc)
			     ? Transform.msword(content, doc)
			     : Transform.html(content, doc);
		}
		if (holds(event, Mime.plaintext)) {
			return Transform.plain(getData(event, Mime.plaintext), doc);
		}
		return content;
	}

	/**
	 * Handles and processes paste events.
	 *
	 * @param  {AlohaEvent} alohaEvent
	 * @return {AlohaEvent}
	 */
	function handle(alohaEvent) {
		var event = alohaEvent.nativeEvent;
		if (event && isPasteEvent(event)) {
			Events.suppress(event);
			var content = extractContent(
				event,
				alohaEvent.editable.elem.ownerDocument
			);
			Undo.capture(alohaEvent.editable.undoContext, {
				meta: {type: 'paste'}
			}, function () {
				var boundary = insert(Boundaries.get(), content);
				Selections.scrollTo(boundary);
				alohaEvent.range = Ranges.fromBoundaries(boundary, boundary);
			});
		}
		return alohaEvent;
	}

	return {
		handle: handle
	};
});
