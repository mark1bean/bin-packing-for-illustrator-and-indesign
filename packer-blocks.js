var APP_IS_INDESIGN = /indesign/i.test(app.name);
var APP_IS_ILLUSTRATOR = /illustrator/i.test(app.name);


/**
 * Creates a "packing attempt" object.
 * @param {Array<bin>} bins - the bins in use.
 * @returns {Attempt}
 */
function Attempt(index, bins) {

    this.area = 0;
    this.bins = bins;
    this.binCount = bins.length;
    this.count = 0;
    this.index = index;
    this.info = [];
    this.score = 0;

    this.packedBlocks = [];
    this.remainingBlocks = [];

};

/**
 * Blocks are used to keep track
 * of items during packing.
 * @author m1b
 * @version 2024-10-14
 * @param {Object} settings -
 * @param {PageItem} item - a Page Item.
 */
function Block(settings, item, index) {

    var getItemBounds = APP_IS_ILLUSTRATOR
        ? getItemBoundsIllustrator
        : getItemBoundsIndesign;

    var bounds = APP_IS_ILLUSTRATOR
        ? getItemBoundsIllustrator(item)
        : getItemBoundsIndesign(item);

    this.item = item;
    this.index = index;
    this.doc = settings.doc;
    this.padding = settings.padding;
    this.margin = settings.margin;
    this.isRotated = false;

    // binIndex will be set later by a Packer
    this.binIndex = undefined;

    if (APP_IS_ILLUSTRATOR) {
        this.w = bounds[2] - bounds[0] + this.padding;
        this.h = bounds[1] - bounds[3] + this.padding;
        this.dx = item.left - bounds[0];
        this.dy = item.top - bounds[1];
    }

    else if (APP_IS_INDESIGN) {
        this.w = bounds[3] - bounds[1] + this.padding;
        this.h = bounds[2] - bounds[0] + this.padding;
        this.dx = item.geometricBounds[1] - bounds[1];
        this.dy = item.geometricBounds[0] - bounds[0];
    }

    this.dimensions = {
        w: this.w,
        h: this.h,
        dx: this.dx,
        dy: this.dy,
    };

    this.rotatedDimensions = {
        w: this.h,
        h: this.w,
        dx: -this.dy,
        dy: item.visibleBounds[2] - bounds[2],
    }

    if (true === settings.forceRotate)
        this.rotate();

};

// swap block between 0 and 90 degree rotation
Block.prototype.rotate = function () {

    if (this.w == this.h) return;

    this.isRotated = !this.isRotated;
    this.w = this.isRotated ? this.rotatedDimensions.w : this.dimensions.w;
    this.h = this.isRotated ? this.rotatedDimensions.h : this.dimensions.h;
    this.dx = this.isRotated ? this.rotatedDimensions.dx : this.dimensions.dx;
    this.dy = this.isRotated ? this.rotatedDimensions.dy : this.dimensions.dy;

};

/**
 * Position the Block's item on an Illustrator Artboard.
 * @param {Object} settings - the packing settings.
 */
Block.prototype.positionItemOnArtboard = function (settings) {

    var self = this;

    if (!self.packed)
        return;

    if (self.isRotated)
        self.item.rotate(90);

    var artboardRect = self.doc.artboards[self.binIndex].artboardRect,
        l = self.x0 + artboardRect[0] + self.margin,
        t = -(self.y0 - artboardRect[1] + self.margin),
        r = self.x1 + artboardRect[0] + self.margin,
        b = -(self.y1 - artboardRect[1] + self.margin);

    if (settings.showBlockBounds)
        var r = drawRectangleIllustrator(self.item.parent, [l, t, r, b]);

    if (settings.showOnlyBlockBounds)
        return;

    // position the item
    self.item.left = l + self.dx;
    self.item.top = t + self.dy;

};

/**
 * Position the Block's item on an Indesign Page.
 * @param {Object} settings - the packing settings.
 */
Block.prototype.positionItemOnPage = function (settings) {

    var self = this;

    if (!self.packed)
        return;

    if (self.isRotated) {
        self.item.transform(
            CoordinateSpaces.pasteboardCoordinates,
            AnchorPoint.CENTER_ANCHOR,
            app.transformationMatrices.add({ counterclockwiseRotationAngle: 90 })
        );
    }

    var bin = settings.bins[self.binIndex];
    var currentPage = bin.page;

    if (self.item.parentPage !== currentPage)
        self.item.move(currentPage);

    // if (settings.showBlockBounds) {
    //     var r = drawRectangle(self.item.parent, [l, t, r, b]);
    //     if (settings.showOnlyBlockBounds)
    //         return;
    // }

    // position the item
    var dx = bin.bounds[1] + self.x0 + self.dx - self.item.geometricBounds[1],
        dy = bin.bounds[0] + self.y0 + self.dy - self.item.geometricBounds[0];

    self.item.transform(
        CoordinateSpaces.pasteboardCoordinates,
        AnchorPoint.TOP_LEFT_ANCHOR,
        app.transformationMatrices.add({ horizontalTranslation: dx, verticalTranslation: dy })
    );

};

// just for debugging
Block.prototype.toString = function () {

    if (!this.packed)
        return '[Object Block, not packed]';

    return '[Object Block, bin:' + this.binIndex
        + ', isRotated:' + this.isRotated
        + ', x0:' + this.x0
        + ', y0:' + this.y0
        + ', w:' + this.w
        + ', h:' + this.h
        + ']';

};

/**
 * Returns bounds of item(s) for Indesign.
 * Note: just a quick conversion of my Illustrator function,
 * so probably doesn't cover many edge cases.
 * @author m1b
 * @version 2024-09-07
 * @param {PageItem|Array<PageItem>} item - an Indesign PageItem or array of PageItems.
 * @param {Boolean} [geometric] - if false, returns visible bounds.
 * @param {Array} [bounds] - private parameter, used when recursing.
 * @returns {Array} - the calculated bounds.
 */
function getItemBoundsIndesign(item, geometric, bounds) {

    var newBounds = [],
        boundsKey = geometric ? 'geometricBounds' : 'visibleBounds';

    if (undefined == item)
        return;

    if (
        'Group' === item.constructor.name
        || 'Array' === item.constructor.name
    ) {

        var children = 'Group' === item.constructor.name ? item.pageItems : item,
            contentBounds = [];

        for (var i = 0; i < children.length; i++)
            contentBounds.push(getItemBoundsIndesign(children[i], geometric, bounds));

        newBounds = combineBounds(contentBounds);

    }

    else if (
        'TextFrame' === item.constructor.name
        && (
            // frame has no fill
            !item.fillColor.hasOwnProperty('model')
            && (
                // frame has no stroke
                !item.strokeColor.hasOwnProperty('model')
                || 0 === item.strokeWeight
            )
        )
    ) {

        // get bounds of outlined text
        var dup = item.duplicate().createOutlines()[0];
        newBounds = dup[boundsKey];
        dup.remove();

    }

    else if (item.hasOwnProperty(boundsKey)) {

        newBounds = item[boundsKey];

    }

    // `bounds` will exist if this is a recursive execution
    bounds = (undefined == bounds)
        ? bounds = newBounds
        : bounds = combineBounds([newBounds, bounds]);

    return bounds;

};

/**
 * Returns bounds of item(s).
 * @author m1b
 * @version 2024-03-10
 * @param {PageItem|Array<PageItem>} item - an Illustrator PageItem or array of PageItems.
 * @param {Boolean} [geometric] - if false, returns visible bounds.
 * @param {Array} [bounds] - private parameter, used when recursing.
 * @returns {Array} - the calculated bounds.
 */
function getItemBoundsIllustrator(item, geometric, bounds) {

    var newBounds = [],
        boundsKey = geometric ? 'geometricBounds' : 'visibleBounds';

    if (undefined == item)
        return;

    if (
        item.typename == 'GroupItem'
        || item.constructor.name == 'Array'
    ) {

        var children = item.typename == 'GroupItem' ? item.pageItems : item,
            contentBounds = [],
            isClippingGroup = (item.hasOwnProperty('clipped') && item.clipped == true),
            clipBounds;

        for (var i = 0, child; i < children.length; i++) {

            child = children[i];

            if (
                child.hasOwnProperty('clipping')
                && true === child.clipping
            )
                // the clipping item
                clipBounds = child.geometricBounds;

            else
                contentBounds.push(getItemBoundsIllustrator(child, geometric, bounds));

        }

        newBounds = combineBounds(contentBounds);

        if (isClippingGroup)
            newBounds = intersectionOfBounds([clipBounds, newBounds]);

    }

    else if (
        'TextFrame' === item.constructor.name
        && TextType.AREATEXT !== item.kind
    ) {

        // get bounds of outlined text
        var dup = item.duplicate().createOutline();
        newBounds = dup[boundsKey];
        dup.remove();

    }

    else if (item.hasOwnProperty(boundsKey)) {

        newBounds = item[boundsKey];

    }

    // `bounds` will exist if this is a recursive execution
    bounds = (undefined == bounds)
        ? bounds = newBounds
        : bounds = combineBounds([newBounds, bounds]);

    return bounds;

};

/**
 * Returns the combined bounds of all bounds supplied.
 * Works with Illustrator or Indesign bounds.
 * @author m1b
 * @version 2024-03-09
 * @param {Array<bounds>} boundsArray - an array of bounds [L, T, R, B] or [T, L , B, R].
 * @returns {bounds?} - the combined bounds.
 */
function combineBounds(boundsArray) {

    var combinedBounds = boundsArray[0],
        comparator;

    if (APP_IS_INDESIGN)
        comparator = [Math.min, Math.min, Math.max, Math.max];

    else if (APP_IS_ILLUSTRATOR)
        comparator = [Math.min, Math.max, Math.max, Math.min];

    // iterate through the rest of the bounds
    for (var i = 1; i < boundsArray.length; i++) {

        var bounds = boundsArray[i];

        combinedBounds = [
            comparator[0](combinedBounds[0], bounds[0]),
            comparator[1](combinedBounds[1], bounds[1]),
            comparator[2](combinedBounds[2], bounds[2]),
            comparator[3](combinedBounds[3], bounds[3]),
        ];

    }

    return combinedBounds;

};

/**
 * Returns the overlapping rectangle
 * of two or more rectangles.
 * NOTE: Returns undefined if ANY
 * rectangles do not intersect.
 * @author m1b
 * @version 2024-09-05
 * @param {Array<bounds>} arrayOfBounds - an array of bounds [L, T, R, B] or [T, L , B, R].
 * @returns {bounds?} - intersecting bounds.
 */
function intersectionOfBounds(arrayOfBounds) {

    var comparator;

    if (APP_IS_INDESIGN)
        comparator = [Math.max, Math.max, Math.min, Math.min];

    else if (APP_IS_ILLUSTRATOR)
        comparator = [Math.max, Math.min, Math.min, Math.max];

    // sort a copy of array
    var bounds = arrayOfBounds
        .slice(0)
        .sort(function (a, b) { return b[0] - a[0] || a[1] - b[1] });

    // start with first bounds
    var intersection = bounds.shift(),
        b;

    // compare each bounds, getting smaller
    while (b = bounds.shift()) {

        // if doesn't intersect, bail out
        if (!boundsDoIntersect(intersection, b))
            return;

        intersection = [
            comparator[0](intersection[0], b[0]),
            comparator[1](intersection[1], b[1]),
            comparator[2](intersection[2], b[2]),
            comparator[3](intersection[3], b[3]),
        ];

    }

    return intersection;

};

/**
 * Returns true if the two bounds intersect.
 * @author m1b
 * @version 2024-03-10
 * @param {Array} bounds1 - bounds array.
 * @param {Array} bounds2 - bounds array.
 * @param {Boolean} [TLBR] - whether bounds arrays are interpreted as [t, l, b, r] or [l, t, r, b] (default: based on app).
 * @returns {Boolean}
 */
function boundsDoIntersect(bounds1, bounds2, TLBR) {

    if (undefined == TLBR)
        TLBR = (APP_IS_INDESIGN);

    return !(

        TLBR

            // TLBR
            ? (
                bounds2[0] > bounds1[2]
                || bounds2[1] > bounds1[3]
                || bounds2[2] < bounds1[0]
                || bounds2[3] < bounds1[1]
            )

            // LTRB
            : (
                bounds2[0] > bounds1[2]
                || bounds2[1] < bounds1[3]
                || bounds2[2] < bounds1[0]
                || bounds2[3] > bounds1[1]
            )
    );

};

/**
 * Draws a rectangle to the document.
 * @param {Document|Layer|GroupItem} container - an Illustrator container.
 * @param {Array<Number>} bounds - [T, L, B, R]
 * @param {Object} props - properties to assign to the rectangle.
 * @return {PathItem}
 */
function drawRectangleIllustrator(container, bounds, properties) {

    properties = properties || {};

    var rectangle = container.rectangles.add(bounds[1], bounds[0], bounds[2] - bounds[0], -(bounds[3] - bounds[1])); // TLWH

    // defaults
    rectangle.filled = false;
    rectangle.stroked = true;

    // apply properties
    for (var key in properties)
        if (properties.hasOwnProperty(key))
            rectangle[key] = properties[key];

    return rectangle;

};

/**
 * Shuffles `things` array into random order;
 * Based on Fischer Yates algorithm.
 * @param {Array<*>} things - the things to shuffle.
 * @returns {Array<*>}
 */
function shuffle(things) {

    // randomises order of an array
    if (!things)
        throw Error("shuffle: no `things` supplied.");

    var i = things.length,
        j = 0,
        temp;

    while (i--) {

        j = Math.floor(Math.random() * (i + 1));
        // swap randomly chosen element with current element
        temp = things[i];
        things[i] = things[j];
        things[j] = temp;

    }

    return things.slice(0);

};

function rotate(item) {

}

/**
 * Draws and returns a Rectangle.
 * For Indesign
 * @author m1b
 * @version 2023-08-24
 * @param {Document|Layer|Group} container - the container for the rectangle.
 * @param {Array<Number>} bounds - rectangle bounds [T,L,B,R].
 * @returns {Rectangle}
 */
function drawRectangleIndesign(container, bounds, props) {

    var rectangle = container.rectangles.add({
        geometricBounds: bounds,
    });

    if (props)
        rectangle.properties = props;

    return rectangle;

};

/**
 * Returns an array of bounds, formed by dividing `bounds`
 * using guides as dividers with `margin` on either side
 * of each guide.
 * @author m1b
 * @version 2024-10-13
 * @param {Array<Number>} bounds - the bounds to divide [T,L,B,R].
 * @param {Array<Guide>} guides - the guides to divide with.
 * @param {Number} [margin] - the margin on either side of a guide (default: 0).
 * @returns {bounds} - [T,L,B,R]
 */
function divideBounds(bounds, guides, margin) {

    margin = margin || 0;

    var dividedBounds = [bounds.slice()];

    // sort guides
    guides.sort(function (a, b) { return b.location - a.location });

    // separate horizontal from vertical guides
    var horizontalGuides = [];
    var verticalGuides = [];

    for (var i = 0; i < guides.length; i++) {

        if (HorizontalOrVertical.HORIZONTAL === guides[i].orientation)
            horizontalGuides.push(guides[i]);

        else if (HorizontalOrVertical.VERTICAL === guides[i].orientation)
            verticalGuides.push(guides[i]);

    }

    // divide by horizontal guides (split vertically)
    dividedBounds = divideByGuides(dividedBounds, horizontalGuides, true);

    // Divide by vertical guides (split horizontally)
    dividedBounds = divideByGuides(dividedBounds, verticalGuides, false);

    return dividedBounds;

    /**
     * Helper function: splits each bounds in `boundsArray` by guides in `guides` array.
     * @author m1b
     * @version 2024-10-13
     * @param {Array<bounds>} boundsArray - array of bounds to divide [ [T,L,B,R], [T,L,B,R], ... ].
     * @param {Array<Guide>} guides - the guides to divide with.
     * @param {Boolean} isHorizontal - orientation of the guides (do not mix orientations!)
     * @returns {Array<bounds>}
     */
    function divideByGuides(boundsArray, guides, isHorizontal) {

        guidesLoop:
        for (var i = 0; i < guides.length; i++) {

            var guideLocation = guides[i].location,
                newBounds = [];

            boundsLoop:
            for (var j = 0; j < boundsArray.length; j++) {

                var currentBounds = boundsArray[j],
                    top = currentBounds[0],
                    left = currentBounds[1],
                    bottom = currentBounds[2],
                    right = currentBounds[3];

                if (isHorizontal) {

                    // horizontal guide, split vertically
                    if (top < guideLocation && bottom > guideLocation) {
                        newBounds.push([top, left, guideLocation - margin, right]);
                        newBounds.push([guideLocation + margin, left, bottom, right]);
                    }

                    else {
                        // no split needed, just add the bounds as is
                        newBounds.push(currentBounds);
                    }

                }

                else {

                    // vertical guide, split horizontally
                    if (left < guideLocation && right > guideLocation) {
                        newBounds.push([top, left, bottom, guideLocation - margin]);
                        newBounds.push([top, guideLocation + margin, bottom, right]);
                    }

                    else {
                        // no split needed, just add the bounds as is
                        newBounds.push(currentBounds);
                    }

                }

            }

            // update boundsArray with the new sections created at this guide
            boundsArray = newBounds;

        }

        return boundsArray;

    };

};

/**
 * Returns `str` converted to points.
 * eg. '10 mm' returns 28.34645669,
 *     '1 inch' returns 72
 * @author m1b
 * @version 2024-09-10
 * @param {String} str - the string to parse.
 * @returns {Number}
 */
function getUnitStringAsPoints(str) {

    if ('Number' === str.constructor.name)
        return str;

    var rawNumber = Number((str.match(/[\d.-]+/) || 0)[0])

    if (isNaN(rawNumber))
        return;

    var convertToPoints = 1;

    if (str.search(/mm/) != -1)
        convertToPoints = 2.834645669;

    else if (str.search(/cm/) != -1)
        convertToPoints = 28.34645669;

    else if (str.search(/(in|inch|\")/) != -1)
        convertToPoints = 72;

    return (rawNumber * convertToPoints);

};