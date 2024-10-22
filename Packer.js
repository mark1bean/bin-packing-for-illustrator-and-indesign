/**
 * Packer: helper to provide 2D rectangular bin packing.
 * By trentium: https://stackoverflow.com/users/7696162/trentium
 * from here: https://stackoverflow.com/questions/56642111/bin-packing-js-implementation-using-box-rotation-for-best-fit
 *
 * Modified by m1b to conform with ExtendScript syntax and minor functionality I wanted.
 */
Packer = function (w, h, allow90DegreeRotation) {
    this.allow90DegreeRotation = (allow90DegreeRotation == true);
    this.init(w, h);
};

Packer.prototype.init = function (w, h) {
    this._root = { x: 0, y: 0, w: w, h: h }
};

Packer.prototype.intersect = function (block0, block1) {
    //
    // Returns the intersecting block of
    // block0 and block1.
    //
    var ix0 = Math.max(block0.x0, block1.x0);
    var ix1 = Math.min(block0.x1, block1.x1);
    var iy0 = Math.max(block0.y0, block1.y0);
    var iy1 = Math.min(block0.y1, block1.y1);

    if (ix0 <= ix1 && iy0 <= iy1) {
        return { x0: ix0, y0: iy0, x1: ix1, y1: iy1 };
    } else {
        return null;
    }
};

Packer.prototype.chunkContains = function (heapBlock0, heapBlock1) {
    //
    // Determine whether heapBlock0 totally encompasses (ie, contains) heapBlock1.
    //
    return heapBlock0.x0 <= heapBlock1.x0 && heapBlock0.y0 <= heapBlock1.y0 && heapBlock1.x1 <= heapBlock0.x1 && heapBlock1.y1 <= heapBlock0.y1;
};

Packer.prototype.expand = function (heapBlock0, heapBlock1) {
    //
    // Extend heapBlock0 and heapBlock1 if they are
    // adjoining or overlapping.
    //
    if (heapBlock0.x0 <= heapBlock1.x0 && heapBlock1.x1 <= heapBlock0.x1 && heapBlock1.y0 <= heapBlock0.y1) {
        heapBlock1.y0 = Math.min(heapBlock0.y0, heapBlock1.y0);
        heapBlock1.y1 = Math.max(heapBlock0.y1, heapBlock1.y1);
    }

    if (heapBlock0.y0 <= heapBlock1.y0 && heapBlock1.y1 <= heapBlock0.y1 && heapBlock1.x0 <= heapBlock0.x1) {
        heapBlock1.x0 = Math.min(heapBlock0.x0, heapBlock1.x0);
        heapBlock1.x1 = Math.max(heapBlock0.x1, heapBlock1.x1);
    }
};

Packer.prototype.unionMax = function (heapBlock0, heapBlock1) {
    //
    // Given two heap blocks, determine whether...
    //
    if (heapBlock0 && heapBlock1) {
        // ...heapBlock0 and heapBlock1 intersect, and if so...
        var i = this.intersect(heapBlock0, heapBlock1);
        if (i) {
            if (this.chunkContains(heapBlock0, heapBlock1)) {
                // ...if heapBlock1 is contained by heapBlock0...
                heapBlock1 = null;
            } else if (this.chunkContains(heapBlock1, heapBlock0)) {
                // ...or if heapBlock0 is contained by heapBlock1...
                heapBlock0 = null;
            } else {
                // ...otherwise, var's expand both heapBlock0 and
                // heapBlock1 to encompass as much of the intersected
                // space as possible.  In this instance, both heapBlock0
                // and heapBlock1 will overlap.
                this.expand(heapBlock0, heapBlock1);
                this.expand(heapBlock1, heapBlock0);
            }
        }
    }
};

Packer.prototype.unionAll = function () {
    //
    // Loop through the entire heap, looking to eliminate duplicative
    // heapBlocks, and to extend adjoining or intersecting heapBlocks,
    // despite this introducing overlapping heapBlocks.
    //
    for (var i = 0; i < this.heap.length; i++) {
        for (var j = 0; j < this.heap.length; j++) {
            if (i !== j) {
                this.unionMax(this.heap[i], this.heap[j]);
                if (this.heap[i] && this.heap[j]) {
                    if (this.chunkContains(this.heap[j], this.heap[i])) {
                        this.heap[i] = null;
                    } else if (this.chunkContains(this.heap[i], this.heap[j])) {
                        this.heap[j] = null;
                    }
                }
            }
        }
    }
    // Eliminate the duplicative (ie, nulled) heapBlocks.
    var onlyBlocks = [];
    for (var i = 0; i < this.heap.length; i++) {
        if (this.heap[i]) {
            onlyBlocks.push(this.heap[i]);
        }
    }
    this.heap = onlyBlocks;
};

Packer.prototype.fit = function (blocks, binIndex) {
    //
    // Loop through all the blocks, looking for a heapBlock
    // that it can fit into.
    //
    this.heap = [{
        x0: 0,
        y0: 0,
        x1: this._root.w,
        y1: this._root.h
    }];

    var n,
        block,
        area = 0,
        packedBlocks = [],
        remainingBlocks = [];

    for (n = 0; n < blocks.length; n++) {

        block = blocks[n];

        if (this.findInHeap(block)) {
            this.adjustHeap(block);
        }

        else if (this.allow90DegreeRotation) {
            // If the block didn't fit in its current orientation,
            // rotate its dimensions and look again.
            block.rotate();

            if (this.findInHeap(block))
                this.adjustHeap(block);

        }

        // was it packed?
        if (block.packed) {
            block.binIndex = binIndex;
            packedBlocks.push(block);
            area += block.w * block.h;
        }

        else {
            remainingBlocks.push(block);
        }

    }

    return {
        count: packedBlocks.length,
        area: area,
        packedBlocks: packedBlocks,
        remainingBlocks: remainingBlocks,
    };
};

Packer.prototype.findInHeap = function (block) {
    //
    // Find a heapBlock that can contain the block.
    //
    for (var i = 0; i < this.heap.length; i++) {
        var heapBlock = this.heap[i];
        if (
            heapBlock
            && block.w <= heapBlock.x1 - heapBlock.x0
            && block.h <= heapBlock.y1 - heapBlock.y0
        ) {
            block.x0 = heapBlock.x0;
            block.y0 = heapBlock.y0;
            block.x1 = heapBlock.x0 + block.w;
            block.y1 = heapBlock.y0 + block.h;
            block.packed = true;
            return true;
        }
    }
    return false;
};

Packer.prototype.adjustHeap = function (block) {
    //
    // Find all heap entries that intersect with block,
    // and adjust the heap by breaking up the heapBlock
    // into the possible 4 blocks that remain after
    // removing the intersecting portion.
    //
    var n = this.heap.length;
    for (var i = 0; i < n; i++) {
        var heapBlock = this.heap[i];
        var overlap = this.intersect(heapBlock, block);
        if (overlap) {

            // Top
            if (overlap.y1 !== heapBlock.y1) {
                this.heap.push({
                    x0: heapBlock.x0,
                    y0: overlap.y1,
                    x1: heapBlock.x1,
                    y1: heapBlock.y1
                });
            }

            // Right
            if (overlap.x1 !== heapBlock.x1) {
                this.heap.push({
                    x0: overlap.x1,
                    y0: heapBlock.y0,
                    x1: heapBlock.x1,
                    y1: heapBlock.y1
                });
            }

            // Bottom
            if (heapBlock.y0 !== overlap.y0) {
                this.heap.push({
                    x0: heapBlock.x0,
                    y0: heapBlock.y0,
                    x1: heapBlock.x1,
                    y1: overlap.y0
                });
            }

            // Left
            if (heapBlock.x0 != overlap.x0) {
                this.heap.push({
                    x0: heapBlock.x0,
                    y0: heapBlock.y0,
                    x1: overlap.x0,
                    y1: heapBlock.y1
                });
            }

            this.heap[i] = null;
        }
    }

    this.unionAll();
};

Packer.prototype.destroy = function () {
    this.heap = null;
};