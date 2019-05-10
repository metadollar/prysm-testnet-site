import { Component, OnInit } from '@angular/core';
import { BlockTreeService } from './block-tree.service';
import { ProgressService } from '../progress.service';
import { BlockTreeResponse } from 'src/proto/chain_pb';
import { Subject, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';

interface GraphVertex {
  id: string | number;
  label: string;
  isJustified: boolean;
  votes: number;
  numAttestations: number;
  numDeposits: number;
  slot: string;
}

interface GraphEdge {
  id: string | number;
  source: string;
  target: string;
}

const GENESIS_SLOT = '9223372036854775808';
const MAX_DEPOSIT_AMOUNT = 3200000000;
const SLOT_DURATION_MILLISECONDS = 6000;

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrls: ['./stats.component.scss']
})
export class StatsComponent implements OnInit {

  inProgress = false;
  nodes: Array<GraphVertex> = [];
  links: Array<GraphEdge> = [];
  update$: Subject<boolean> = new Subject();
  center$: Subject<boolean> = new Subject();

  constructor(
    private readonly blockService: BlockTreeService,
    private readonly progress: ProgressService,
  ) {
    this.progress.progress.subscribe(v => this.inProgress = v);
  }

  slotPoll() {
    return interval(SLOT_DURATION_MILLISECONDS)
      .pipe(
        switchMap(() => {
          this.progress.startProgress();
          return this.blockService.getBlockTree();
        }), 
        // distinctUntilChanged(), // only emit and redraw graph if the value has actually changed
      );
  }

  ngOnInit() {
    this.slotPoll().subscribe(async (res: BlockTreeResponse) => {
      const tree = this.blockService.sortTree(res.getTreeList());
      const existingParentBlocks = {};
      const newNodes = tree.map((node, idx) => {
        const blockRoot = this.blockService.toHexString(node.getBlockRoot());
        existingParentBlocks[blockRoot] = true;
        return {
          id: blockRoot,
          label: blockRoot,
          isJustified: idx === 0,
          votes: node.getVotes() / MAX_DEPOSIT_AMOUNT,
          numAttestations: node.getBlock().getBody().getAttestationsList().length,
          numDeposits: node.getBlock().getBody().getDepositsList().length,
          slot: (BigInt(node.getBlock().getSlot()) - BigInt(GENESIS_SLOT)).toString(),
        };
      });

      let newLinks = [];
      for (let i = 0; i < this.nodes.length; i++) {
        const node = tree[i];
        const blockRoot = this.blockService.toHexString(node.getBlockRoot());
        const parentRoot = this.blockService.toHexString(node.getBlock().getParentRootHash32());
        const hasParent = existingParentBlocks[parentRoot];
        if (hasParent) {
          newLinks.push({
            id: blockRoot.slice(0, 3),
            source: parentRoot,
            target: blockRoot,
          });
        }
      }
      this.nodes = newNodes;
      this.links = newLinks;
      this.update$.next(true);
      this.center$.next(true);
      this.progress.stopProgress();
    });
  }
}
