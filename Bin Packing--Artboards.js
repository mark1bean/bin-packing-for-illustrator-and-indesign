/**
 * @file Bin Packing--Artboards.js
 *
 * Pack selected items onto Artboards in Illustrator
 *
 * Notes:
 *   - script will pack items into available pages,
 *     so set those up how you want.
 *   - if you enable 'Try Harder' the script won't
 *     stop at the first adequate packing attempt
 *     (ie. no unpacked items); mostly this is fine
 *     but sometimes further attempts can yield a
 *     better result. Look at the results text to
 *     see which attempt was chosen as best. Go and
 *     make yourself a coffee while it tries thousands
 *     of attempts: sometimes it will hit on a winner.
 *   - the first 5 attempts always use pre-set sort
 *     functions, chosen as being most likely to provide
 *     a good result; after that every attempt just
 *     does a random shuffle.
 *   - the pre-calculated Max Attempts number doesn't
 *     mean much; feel free to adjust.
 *   - the Random button runs a single, random-shuffled
 *     packing without dismissing the dialog, which
 *     could be handy if you're looking for an aesthetic
 *     result.
 *   - scoring system favours packing more items in
 *     fewer bins with less remaining, weighted somewhat
 *     to prefer packed area or item count.
 *   - padding or margin can be negative (to cause
 *     overlaps).
 *   - turn off UI by changing `settings.showUI` to
 *     false.
 *
 * See also: "Bin Packing--Pages.js" for Indesign.
 *
 * @author m1b
 * @version 2024-10-22
 * @discussion https://community.adobe.com/t5/illustrator-discussions/how-to-organize-multiple-different-objects-on-one-sheet-with-a-defined-gap-inbetween-them/m-p/12475475#M295934
 */
//@include 'Packer.js'
//@include 'packer-blocks.js'
(function () {

    if (
        0 === app.documents.length
        || 0 === app.activeDocument.selection.length
    )
        return alert('Please select some items and try again.');

    var settings = {

        // document
        doc: app.activeDocument,

        // artboard items (can be groupItems)
        items: app.activeDocument.selection,

        // space between items, in pts, or can use 'mm' or 'inch'
        padding: '1mm',

        // space around edges of artboards, in pts, or can use 'mm' or 'inch'
        margin: '5mm',

        // is it okay to rotate 90 degrees?
        allow90DegreeRotation: true,

        // is it okay to rotate any amount?
        // if so, items will be first rotated to fit best into a rectangle
        // in practice this may cause rotation between 0 and 90°
        allowAnyRotation: true,

        // choose 'count' to prefer item count,
        // or 'area' to prefer area packed
        bestFitBy: 'count',

        // the maximum number of attempts at packing
        // - more attempts sometimes works better, but rarely.
        // - note that if `tryHarder` is off, and a solution is found,
        //   the script will stop before reaching `maxAttemptCount`.
        // - leave undefined to auto-calculate
        maxAttemptCount: undefined,

        // should we stop on first successul packing, or keep trying to improve?
        // when this is on, the packing will always make `maxAttemptCount` attempts.
        tryHarder: false,

        // shows the UI options
        showUI: true,

        // show results after packing
        showResults: true,

        // only remaining items will be left selected
        keepRemainingItemsSelected: true,

        // turning this on keep items in original layer order, at the expense of packing efficacy
        doNotSort: false,

        // debugging options
        showBlockBounds: false,
        showOnlyBlockBounds: false,
        debugBinBounds: false,
        forceRotate: false,

    };

    settings.info = [];
    settings.packFunction = packItemsIllustrator;

    if (settings.showUI) {

        var result = ui(settings);

        if (2 === result)
            // user cancelled
            return;

    }

    // show progress window

    var pb = makeProgressWindow();
    if (!pb)
        return;

    settings.pb = pb;
    pb.center();
    pb.show();

    // do the packing
    packItemsIllustrator(settings);

    pb.close();

})();

/**
 * Packs items in document.
 * @author m1b
 * @version 2024-10-13
 * @param {Object} settings - see `settings` variable above.
 * @param {Document} settings.doc - an Illustrator Document.
 * @param {Array<PageItem>} settings.items - the items to pack.
 * @param {Number} [settings.padding] - the space to leave between packed items (default: 0).
 * @param {Boolean} [settings.usePageMargins] - whether to use the artboard margins (default: false).
 * @param {Number} [settings.margin] - the distance between artboard edge and bin, if applicable (default: 0).
 * @param {Boolean} [settings.useGuidesToDivideBins] - whether to divide artboard bin by guides (default: false).
 * @param {Number} [settings.guidesMargin] - the margin to leave either side of each guide. (default: 0)
 * @param {Boolean} [settings.allow90DegreeRotation] - whether to allow rotation by 90° (default: false).
 * @param {Boolean} [settings.allowArbitraryRotation] - whether to allow rotation by any amount to better fit into a rectangle (default: false).
 * @param {String} [settings.bestFitBy] - can be 'count' or 'area' (default: 'count').
 * @param {Number} [settings.maxAttemptCount] - the maximum number of attempts made (default: calculated).
 * @param {Boolean} [settings.tryHarder] - whether to keep trying, even after all items are packed (default: false).
 * @param {Boolean} [settings.showResults] - whether to show an alert message if any items couldn't be packed (default: false).
 * @param {Boolean} [settings.keepRemainingItemsSelected] - whether to deselect items, and only keep unpacked items selected afterwards (default: false).
 * @param {Boolean} [settings.doNotSort] - whether to disable sorting, so that each attempt is just a random shuffle (default: false).
 * @param {Boolean} [randomAttempt] - whether this is a "random attempt" which will temporarily set maxAttemptCount to 1 (Default: false).
 */
function packItemsIllustrator(settings, randomAttempt) {

    randomAttempt = true === randomAttempt;

    if ('Array' === settings.constructor.name)
        settings = settings[0];

    // convert settings to points
    settings.padding = getUnitStringAsPoints(settings.padding);
    settings.margin = getUnitStringAsPoints(settings.margin);

    var doc = settings.doc || app.activeDocument,
        items = settings.items || doc.selection,
        padding = settings.padding || 0,
        margin = settings.margin || 0,
        allow90DegreeRotation = true === settings.allow90DegreeRotation,
        allowAnyRotation = true === settings.allowAnyRotation,
        bestFitBy = settings.bestFitBy || 'count',
        maxAttemptCount = randomAttempt ? 1 : (settings.maxAttemptCount || getMaxAttemptCount(items.length)),
        preferCount = (bestFitBy == 'count'),
        preferArea = (bestFitBy == 'area'),
        pb = settings.pb,
        totalItemCount = items.length,
        totalItemArea = 0;

    if (padding.constructor.name == 'String')
        padding = getUnitStringAsPoints(padding);

    if (margin.constructor.name == 'String')
        margin = getUnitStringAsPoints(margin);

    // make bins
    var bins = [],
        artboards = doc.artboards;

    for (var i = 0; i < artboards.length; i++) {

        var binBounds = artboardRectToBinBounds(artboards[i].artboardRect);

        // include artboard margins
        binBounds = [
            binBounds[0] + margin,
            binBounds[1] + margin,
            binBounds[2] - margin,
            binBounds[3] - margin,
        ];

        bins.push({
            artboard: artboards[i],
            bounds: binBounds,
            width: binBounds[3] - binBounds[1] + padding,
            height: binBounds[2] - binBounds[0] + padding,
        });

    }

    // add bins to settings because Block methods need them
    settings.bins = bins;

    if (settings.debugBinBounds) {
        // debugging: show bin bounds
        for (var i = 0; i < bins.length; i++) {
            var bin = bins[i];
            var r = drawRectangleIllustrator(doc, bin.bounds, {
                strokeColor: doc.swatches[4],
                fillColor: doc.swatches[0],
                note: 'Bin ' + i,
            });
        }
        return;
    }

    if (pb)
        pb.setItemsPackedProgress(0, totalItemCount);

    var bestAttempt;

    attemptsLoop:
    for (var a = 0; a < maxAttemptCount; a++) {

        if (pb)
            pb.setAttemptProgress(a + 1, maxAttemptCount);

        var attempt = new Attempt(a, bins);

        // make a fresh array of 'blocks' which will store positioning information
        for (var j = 0, block; j < items.length; j++) {

            if (allowAnyRotation)
                // rotate item to fit smallest rectangle
                items[j].rotate(-findRotationByMinimalBoundsIllustrator(items[j]));

            block = new Block(settings, items[j], j);
            attempt.remainingBlocks.push(block);

            if (a == 0)
                totalItemArea += block.w * block.h;

        }

        if (!settings.doNotSort) {
            // we use attempt.index as the `sortType`
            // to cycle through each sorting method
            // before resorting to random shuffle
            sortBlocks(attempt, randomAttempt ? Infinity : attempt.index);
        }

        binsLoop:
        for (var i = 0; i < bins.length; i++) {

            var bin = bins[i],

                // instantiate Trentium's packer
                packer = new Packer(bin.width, bin.height, allow90DegreeRotation),

                // do the fitting
                result = packer.fit(attempt.remainingBlocks, i);

            attempt.area += result.area;
            attempt.binCount = i + 1;
            attempt.packedBlocks = attempt.packedBlocks.concat(result.packedBlocks);
            attempt.remainingBlocks = result.remainingBlocks.slice();

            // calculate score for this bin
            var scoreFactor = preferCount
                ? totalItemCount / result.count
                : totalItemArea / result.area;

            attempt.score += ((bin.width * bin.height) / result.area) * scoreFactor;

            // add info for this attempt
            attempt.info.push('Packed ' + result.count + ' items onto artboard ' + (i + 1) + '.');

            packer.destroy();

            if (0 === attempt.remainingBlocks.length)
                break;

        } // end bin loop

        // an attempt with a lower binCount always wins
        attempt.score += (bins.length - attempt.binCount) * 100;
        attempt.score -= attempt.remainingBlocks.length * 100;

        if (
            undefined == bestAttempt
            || attempt.score > bestAttempt.score
        ) {
            // the best attempt so far
            bestAttempt = attempt;

            if (pb) {
                pb.setItemsPackedProgress(bestAttempt.packedBlocks.length, totalItemCount);
                pb.setBestBinCount(bestAttempt.binCount, bestAttempt.index);
            }

        }

        if (settings.doNotSort)
            // only need one attempt if not sorting
            break;

        // try a minimum of 5 times (once for each sort method)
        if (
            true !== settings.tryHarder
            && a > 4
            && 0 === bestAttempt.remainingBlocks.length
        )
            // all blocks are fitting so don't bother with more attempts
            break;

    } // end attempts loop

    /** ------------------------- *
     * Position items according   *
     * to best packing attempt    *
     * -------------------------- */
    var finalPackedBlockCount = 0;

    if (undefined != bestAttempt.packedBlocks) {

        finalPackedBlockCount = bestAttempt.packedBlocks.length;

        // position the items from the best attempt
        for (var i = 0; i < finalPackedBlockCount; i++)
            bestAttempt.packedBlocks[i].positionItemOnArtboard(settings);

    }

    var remainingBlockCount = totalItemCount - finalPackedBlockCount;

    settings.info = settings.info.concat(bestAttempt.info);

    if (remainingBlockCount > 0)
        settings.info.push(remainingBlockCount + ' item' + (remainingBlockCount > 1 ? 's' : '') + ' remaining.');

    if (pb)
        pb.setItemsPackedProgress(finalPackedBlockCount, totalItemCount);

    if (settings.keepRemainingItemsSelected) {

        var selected = [];

        for (var i = 0; i < bestAttempt.remainingBlocks.length; i++)
            selected.push(bestAttempt.remainingBlocks[i].item);

        doc.selection = selected;

    }

    if (pb)
        pb.close(1);

    if (settings.showResults)
        showResults(settings, bestAttempt);

};

/**
 * Shows UI for Bin Packing
 * @param {Object} settings - the settings to adjust via UI.
 * @returns {1|2} - result code
 */
function ui(settings) {

    settings.randomAttempt = false;

    var w = new Window("dialog", 'Pack Items', undefined, { closeButton: false }),

        introGroup = w.add('group {orientation:"column", alignChildren: "fill", alignment: ["fill","top"], margins: [15,15,15,15] }'),
        introText = introGroup.add('statictext { text:"", justify: "center" }'),

        panelGroup = w.add('group {orientation:"row", alignChildren:["left","top"] }'),
        panel1 = panelGroup.add('panel'),
        panel2 = panelGroup.add('panel'),

        paddingGroup = panel1.add("group {orientation:'column', alignment:['left','top'], alignChildren: ['left','top'], margins:[0,10,0,0], preferredSize: [120,-1] }"),
        paddingLabel = paddingGroup.add('statictext { text: "Space between items:" }'),
        paddingField = paddingGroup.add('edittext {text: "", preferredSize: [120,-1] }'),

        marginGroup = panel1.add("group {orientation:'column', alignment:['left','top'], alignChildren: ['left','top'], margins:[0,10,0,0], preferredSize: [120,-1] }"),
        marginLabel = marginGroup.add('statictext { text: "Artboard margin:" }'),
        marginField = marginGroup.add('edittext {text: "", preferredSize: [120,-1] }'),

        maxAttemptsGroup = panel2.add('group {orientation:"column", alignment:["left","top"], alignChildren: ["left","top"], margins:[0,10,0,0], preferredSize: [120,-1] }'),
        maxAttemptsLabel = maxAttemptsGroup.add('statictext { text:"Max attempts:" }'),
        maxAttemptsField = maxAttemptsGroup.add('edittext { text: "", preferredSize: [120,-1] }'),

        bestFitGroup = panel2.add('group {orientation:"column", alignment:["left","top"], alignChildren: ["left","top"], margins:[0,10,0,0], preferredSize: [120,-1] }'),
        bestFitLabel = bestFitGroup.add('statictext { text:"Maximize:" }'),
        bestFitMenu = bestFitGroup.add('dropDownList { preferredSize:[120,-1] }'),

        checkboxGroup = panel2.add('group {orientation:"column", alignment:["left","top"], alignChildren: ["left","top"], margins:[0,20,0,0], preferredSize: [120,-1] }'),
        allowRotationCheckbox = checkboxGroup.add("Checkbox { alignment:'left', text:'Allow 90° rotation', margins:[0,10,0,0], value:false }"),
        allowAnyRotationCheckbox = checkboxGroup.add("Checkbox { alignment:'left', text:'Allow any rotation', margins:[0,10,0,0], value:false }"),
        tryHarderCheckbox = checkboxGroup.add("Checkbox { alignment:'left', text:'Try harder', margins:[0,10,0,0], value:false }"),
        disableSortingCheckbox = checkboxGroup.add("Checkbox { alignment:'left', text:'Do not sort', margins:[0,10,0,0], value:false }"),

        showResultsCheckbox = w.add("Checkbox { alignment:'left', text:'Show results summary', margins:[0,10,0,0], value:false }"),

        buttonGroup = w.add('group {orientation:"row", alignment:["center","bottom"], alignChildren: ["right","bottom"], margins: [0,-5,0,0] }'),
        randomGroup = buttonGroup.add('group {orientation:"column", alignment:["center","bottom"], alignChildren: ["right","bottom"], margins: [0,0,50,0] }'),
        randomResult = randomGroup.add('statictext { text:"", alignment: ["fill","bottom"], justify: "center" }'),
        randomButton = randomGroup.add('button', undefined, 'Random'),
        cancelButton = buttonGroup.add('button', undefined, 'Cancel', { name: 'cancel' }),
        packButton = buttonGroup.add('button', undefined, 'Pack', { name: 'ok' });

    var items = settings.items;

    if (undefined == settings.margin)
        settings.margin = '0 mm';

    if (undefined == settings.maxAttemptCount)
        settings.maxAttemptCount = getMaxAttemptCount(items.length);

    w.preferredSize.width = 250;
    introText.text = 'Trying to pack ' + settings.items.length + ' items onto ' + settings.doc.artboards.length + ' artboards';
    marginField.text = String(settings.margin);
    paddingField.text = String(settings.padding);
    maxAttemptsField.text = String(settings.maxAttemptCount);
    allowRotationCheckbox.value = settings.allow90DegreeRotation;
    allowAnyRotationCheckbox.value = settings.allowAnyRotation;
    tryHarderCheckbox.value = settings.tryHarder;
    disableSortingCheckbox.value = settings.doNotSort;
    showResultsCheckbox.value = settings.showResults;

    bestFitMenu.add('item', 'Items packed');
    bestFitMenu.add('item', 'Area packed');
    bestFitMenu.selection = 0;

    randomButton.onClick = function () {

        if (settings.lastAttemptWasRandom == true)
            undoRandomAttempt();

        updateSettings();

        settings.randomAttempt = true;

        var result = settings.packFunction(settings, true);

        settings.lastAttemptWasRandom = true;
        settings.randomAttempt = false;

        app.redraw();

    };

    function undoRandomAttempt() {
        app.undo();
        settings.lastAttemptWasRandom = false;
    };

    packButton.onClick = function () {

        if (settings.lastAttemptWasRandom == true)
            undoRandomAttempt();

        updateSettings();
        w.close(1);

    };

    if (settings.windowLocation)
        w.location = settings.windowLocation;
    else
        w.center();

    return w.show();

    function updateSettings() {

        settings.padding = paddingField.text;
        settings.margin = marginField.text;
        settings.maxAttemptCount = Number(maxAttemptsField.text);
        settings.bestFitBy = bestFitMenu.selection.index == 0 ? 'count' : 'area';
        settings.allow90DegreeRotation = allowRotationCheckbox.value;
        settings.allowAnyRotation = allowAnyRotationCheckbox.value;
        settings.tryHarder = tryHarderCheckbox.value;
        settings.doNotSort = disableSortingCheckbox.value;
        settings.showResults = showResultsCheckbox.value;

    };

};

/**
 * Makes a progress bar window.
 * @author m1b
 * @version 2024-10-13
 * @returns {Window} - ScriptUI window.
 */
function makeProgressWindow() {

    var w = new Window('window', 'Pack Items', undefined, { closeButton: false, resize: true }),

        itemsPackedGroup = w.add("group {orientation:'column', alignChildren: 'fill', alignment:['fill','top'], margins: [15,15,15,15] }"),
        pb1Label = itemsPackedGroup.add('statictext { text:"Items packed" }'),
        pb1Row = itemsPackedGroup.add("group {orientation:'row', alignChildren: 'fill', alignment:['fill','top'], margins: [15,15,15,15] }"),
        pb1 = pb1Row.add('progressbar { bounds: [12, 12, 400, 12], value: 0, maxvalue: 100 }'),
        pb1display = pb1Row.add('statictext { text:"1 / 1", size:[100,24] }'),

        stack = w.add("group {orientation:'stack', alignment:['fill','fill']}"),
        progressGroup = stack.add("group {orientation:'column', alignChildren: 'fill', alignment:['fill','fill'] }"),

        attemptsGroup = progressGroup.add("group {orientation:'column', alignChildren: 'fill', alignment:['fill','top'], margins: [15,15,15,15] }"),
        pb2Label = attemptsGroup.add('statictext { text:"Attempt number" }'),
        pb2Row = attemptsGroup.add("group {orientation:'row', alignChildren: 'fill', alignment:['fill','top'], margins: [15,15,15,15] }"),
        pb2 = pb2Row.add('progressbar { bounds: [12, 12, 400, 12], value: 0, maxvalue: 100 }'),
        pb2display = pb2Row.add('statictext { text:"1 / 1", minimumSize: [100,24] }'),

        resultsGroup = stack.add("group {orientation:'column', alignChildren: ['fill','fill'], alignment: ['fill','fill'], margins: [15,0,15,0], visible: false }"),
        infoText = resultsGroup.add('statictext { text:"results", preferredSize: [-1,100], properties: { multiline: true } }'),

        resultsButtons = resultsGroup.add("group {orientation:'row', alignment:['right','bottom'], scrolling: true }"),
        doneButton = resultsButtons.add('button', undefined, 'Done', { name: 'ok' });

    w.defaultElement = doneButton;

    doneButton.onClick = function () { w.close(1) };

    w.setAttemptProgress = function (attemptIndex, maxAttemptCount) {
        pb2.value = attemptIndex;
        pb2.maxvalue = maxAttemptCount;
        pb2display.text = attemptIndex + ' / ' + maxAttemptCount;
        w.update();
    };

    w.setItemsPackedProgress = function (packedItemCount, totalItemCount) {
        pb1.value = packedItemCount;
        pb1.maxvalue = totalItemCount;
        pb1display.text = packedItemCount + ' / ' + totalItemCount;
        w.update();
    };

    w.setBestBinCount = function (binCount, attempt) {
        pb1Label.text = 'Items packed in ' + binCount + ' bins on attempt ' + attempt + '.';
    };

    return w;

};

/**
 * Convert "artboard rect" [L,T,R,B] with negative Y axis
 * to "bin bounds" [T,L,B,R] with positive Y axis.
 * @param {Array<Number>} rect - the artboard rect [L, T, R, B].
 * @returns {Array<Number>}
 */
function artboardRectToBinBounds(rect) {
    return [-rect[1], rect[0], -rect[3], rect[2]];
};

/**
 * Convert "bin bounds" [T,L,B,R] with positive Y axis
 * to "artboard rect" [L,T,R,B] with negative Y axis.
 * @param {Array<Number>} bounds - the bin bounds [T, L, B, R].
 * @returns {Array<Number>}
 */
function binBoundsToArtboardRect(bounds) {
    return [bounds[1], -bounds[0], bounds[3], -bounds[2]];
};

/**
 * Returns estimate for maximum attempts count.
 * @param {Number} itemCount - number of items to bec packed.
 * @returns {Number}
 */
function getMaxAttemptCount(itemCount) {
    return Math.min(200, 4 + Math.floor(Math.log(itemCount) / Math.log(2) * 5));
}

function sortBlocksByInterleaving(blocks) {

    // sort blocks by area in descending order
    blocks.sort(function (a, b) {
        var areaA = a.w * a.h;
        var areaB = b.w * b.h;
        return areaB - areaA;
    });

    // divide blocks into two groups (larger and smaller areas)
    var half = Math.ceil(blocks.length / 2);
    var largerBlocks = blocks.slice(0, half);
    var smallerBlocks = blocks.slice(half);

    // interleave blocks from both halves
    var interleavedBlocks = [];
    var i = 0, j = 0;

    while (i < largerBlocks.length || j < smallerBlocks.length) {

        if (i < largerBlocks.length)
            interleavedBlocks.push(largerBlocks[i++]);

        if (j < smallerBlocks.length)
            interleavedBlocks.push(smallerBlocks[j++]);

    }

    return interleavedBlocks;

};

/**
 * Sorts an `attempt`'s blocks.
 * @author m1b
 * @version 2024-10-13
 * @param {Attempt} attempt - the attempt to sort.
 * @param {Number} [sortType] - index of sorting method (default: random shuffle).
 */
function sortBlocks(attempt, sortType) {

    if (undefined == sortType)
        sortType = attempt.index;

    switch (sortType) {

        case undefined:
            attempt.sortType = 'no sorting';
            break;

        case 0:
            attempt.remainingBlocks.sort(function byArea(a, b) { return (b.w * b.h) - (a.w * a.h) });
            attempt.sortType = 'area';
            break;

        case 1:
            attempt.remainingBlocks.sort(function byLargestDimension(a, b) { return Math.max(b.w, b.h) - Math.max(a.w, a.h) });
            attempt.sortType = 'largest dimension'
            break;

        case 2:
            attempt.remainingBlocks.sort(function byWidth(a, b) { return b.w - a.w });
            attempt.sortType = 'width'
            break;

        case 3:
            attempt.remainingBlocks.sort(function byHeight(a, b) { return b.h - a.h });
            attempt.sortType = 'height'
            break;

        case 4:
            // interleave large and small items
            attempt.remainingBlocks = sortBlocksByInterleaving(attempt.remainingBlocks);
            attempt.sortType = 'interleaving'
            break;

        default:
            // random sort
            shuffle(attempt.remainingBlocks);
            attempt.sortType = 'random shuffle'
            break;
    }

};

/**
 * Shows results of bin packing.
 * @param {Attempt} - the attempt used, ie. the winning attempt.
 * @returns {1|2} - result code
 */
function showResults(settings, attempt) {

    var w = new Window("dialog", 'Pack Items Result', undefined, { closeButton: false }),

        resultGroup = w.add('group {orientation:"column", alignChildren: "fill", alignment: ["fill","fill"], margins: [15,15,15,15] }'),
        resultText = resultGroup.add('statictext { text:"", justify: "left", alignment:["fill","fill"], properties:{multiline:true} }'),

        buttonGroup = w.add('group {orientation:"row", alignment:["center","bottom"], alignChildren: ["right","bottom"], margins: [0,-5,0,0] }'),
        okButton = buttonGroup.add('button', undefined, 'Done', { name: 'ok' });

    resultText.preferredSize = [250, 230];

    var info = [
        (0 === attempt.remainingBlocks.length ? 'SUCCESS: Packed ' + attempt.packedBlocks.length + ' blocks.' : 'FAILED: ' + attempt.remainingBlocks.length + ' blocks remaining.'),
        '',
        'Attempt number: ' + attempt.index,
        'SortType: ' + (attempt.sortType || 'not sorted'),
        'Score: ' + Math.round(attempt.score),
        ''
    ];

    info = info.concat(attempt.info);
    resultText.text = info.join('\n');

    if (settings.windowLocation)
        w.location = settings.windowLocation;
    else
        w.center();

    app.redraw();

    return w.show();

};

// just for debugging block order
function listBlocks(blocks) {

    var str = '';

    for (var i = 0; i < blocks.length; i++)
        str += blocks[i].index + ', ';

    return str;

};