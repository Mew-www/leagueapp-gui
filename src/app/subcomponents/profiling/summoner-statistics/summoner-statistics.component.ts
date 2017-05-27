import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnInit, QueryList, ViewChildren
} from '@angular/core';
import {Summoner} from "../../../models/dto/summoner";
import {PlayerApiService} from "../../../services/player-api.service";
import {GameType} from "../../../enums/game-type";
import {ResType} from "../../../enums/api-response-type";
import {Subscription} from "rxjs/Subscription";
import {TranslatorService} from "../../../services/translator.service";
import {Observable} from "rxjs/Observable";
import {Championmastery} from "../../../models/dto/championmastery";
import {GameReference} from "../../../models/dto/game-reference";
import {ChampionsContainer} from "app/models/dto/containers/champions-container";
import {ItemsContainer} from "../../../models/dto/containers/items-container";

@Component({
  selector: 'summoner-statistics',
  templateUrl: './summoner-statistics.component.html',
  styleUrls: ['./summoner-statistics.component.scss']
})
export class SummonerStatisticsComponent implements OnInit, OnChanges, AfterViewInit {

  @Input() champions: ChampionsContainer;
  @Input() items: ItemsContainer;
  @Input() summoner: Summoner;
  private ongoing_request: Subscription = null;
  private loading = true;

  private gamehistory: Array<GameReference> = null;
  private gamehistory_filter_queues: Array<GameType> = [];
  private gamehistory_filter_champion_ids: Array<number> = [];
  private gamehistory_error_text_key = "";
  private gamehistory_error_details = "";
  private autoload_these_games = [];

  private masterypoints: Array<Championmastery> = null;
  private masterypoints_toggled = true;
  private masterypoints_error_text_key = "";
  private masterypoints_error_details = "";

  private Math;
  private gettext: Function;

  @ViewChildren('lazy_mastery_scroller') lazy_scroller_query: QueryList<any>;
  private masteryscroller: ElementRef;
  private scrolling_masteries = false;
  private scrolling_masteries_timeout;
  private scrolling_masteries_right_available = false;
  private scrolling_masteries_left_available = false;

  constructor(private player_api: PlayerApiService,
              private translator: TranslatorService,
              private changeDetector: ChangeDetectorRef) {
    this.gettext = this.translator.getTranslation;
    this.Math = Math;
  }

  private getFilteredGames() {
    return this.gamehistory
      .filter(g => {
        if (this.gamehistory_filter_queues.length === 0) {
          return true;
        }
        return this.gamehistory_filter_queues.indexOf(g.game_type) !== -1;
      })
      .filter(g => {
        if (this.gamehistory_filter_champion_ids.length === 0) {
          return true;
        }
        return this.gamehistory_filter_champion_ids.indexOf(g.chosen_champion.id) !== -1;
      });
  }

  private getFilteredLoadedGames() {
    return this.gamehistory
      .filter(g => {
        if (this.gamehistory_filter_queues.length === 0) {
          return true;
        }
        return this.gamehistory_filter_queues.indexOf(g.game_type) !== -1;
      })
      .filter(g => {
        if (this.gamehistory_filter_champion_ids.length === 0) {
          return true;
        }
        return this.gamehistory_filter_champion_ids.indexOf(g.chosen_champion.id) !== -1;
      })
      .filter(g => g.game_details !== null)
      .map(g => g.game_details);
  }

  private onMasteriesScrolled(e) {
    let scroller = e.target;

    if (this.scrolling_masteries) {
      // Refresh (=[if exists] clear old and [anyway] set new) timeout
      if (this.scrolling_masteries_timeout) {
        window.clearTimeout(this.scrolling_masteries_timeout);
      }
      this.scrolling_masteries_timeout = window.setTimeout(() => {
        this.scrolling_masteries = false;
        this.onMasteriesScrollingEnd(scroller);
      }, 1000);
    } else {
      console.log("Starting to scroll.");
      this.scrolling_masteries = true;
      this.scrolling_masteries_timeout = window.setTimeout(() => {
        this.scrolling_masteries = false;
        this.onMasteriesScrollingEnd(scroller);
      }, 1000);
    }

  }
  private onMasteriesScrollingEnd(scroller) {
    let masteries = <Array<Element>>Array.from(scroller.children);

    // Check right
    let scrollerRightmostPoint = scroller.getBoundingClientRect().right;
    let nonVisibleMasteriesToRight = masteries
    // "mastery's right edge is before (smaller px position than) scroller's rightmost edge" * (NOT)
      .filter(m => !(m.getBoundingClientRect().right <= scrollerRightmostPoint));
    this.scrolling_masteries_right_available = nonVisibleMasteriesToRight.length > 0;
    console.log(nonVisibleMasteriesToRight.length + " non-visible Masteries to the RIGHT");

    // Check left
    let scrollerLeftmostPoint = scroller.getBoundingClientRect().left;
    let nonVisibleMasteriesToLeft = masteries
    // "mastery's left edge is after (bigger px position [more to right] than) scroller's leftmost edge" * (NOT)
      .filter(m => !(m.getBoundingClientRect().left >= scrollerLeftmostPoint));
    this.scrolling_masteries_left_available = nonVisibleMasteriesToLeft.length > 0;
    console.log(nonVisibleMasteriesToLeft.length + " non-visible Masteries to the LEFT");
  }

  private onClickToggleMasteries() {
    this.masterypoints_toggled = !this.masterypoints_toggled;
  }
  private onClickMasteriesGotoRight(scroller) {
    // If the 1s scrolling timeout still exists, cancel scrolling immediately
    if (this.scrolling_masteries) {
      if (this.scrolling_masteries_timeout) {
        window.clearTimeout(this.scrolling_masteries_timeout);
      }
      this.scrolling_masteries = false;
      this.onMasteriesScrollingEnd(scroller);
    }
    // Find how many non-visible masteries (if any) are there to scroll
    let masteries = <Array<Element>>Array.from(scroller.children);
    let scrollOffset = scroller.scrollLeft;
    let scrollerLeftMargin = scroller.getBoundingClientRect().left;
    let temporaryArrowMargin = 121;
    let scrollerWidth = scroller.getBoundingClientRect().right - scrollerLeftMargin;
    let scrollerRightmostPoint = scroller.getBoundingClientRect().right;
    let nonVisibleMasteriesToRight = masteries
      // "mastery's right edge is before (smaller px position than) scroller's rightmost edge" * (NOT)
      .filter(m => !(m.getBoundingClientRect().right <= scrollerRightmostPoint));
    if (nonVisibleMasteriesToRight.length === 0) {
      // No scrollable content
      return;
    }
    // Get the leftmost non-visible mastery and set el.scrollLeft there
    let toScrollLeft = scrollOffset + nonVisibleMasteriesToRight[0].getBoundingClientRect().left - scrollerLeftMargin - temporaryArrowMargin;
    if (toScrollLeft > (scroller.scrollWidth-scrollerWidth)) {
      console.log("This would go beyond max scrollWidth, resetting to scrollWidth.");
      toScrollLeft = scroller.scrollWidth-scrollerWidth;
    }
    scroller.scrollLeft = toScrollLeft; // This'll trigger onMasteriesScrolled and so forth (ScrollingEnd after 1s)
  }
  private onClickMasteriesGotoLeft(scroller) {
    // If the 1s scrolling timeout still exists, cancel scrolling immediately
    if (this.scrolling_masteries) {
      if (this.scrolling_masteries_timeout) {
        window.clearTimeout(this.scrolling_masteries_timeout);
      }
      this.scrolling_masteries = false;
      this.onMasteriesScrollingEnd(scroller);
    }
    // Find how many non-visible masteries (if any) are there to scroll
    let masteries = <Array<Element>>Array.from(scroller.children);
    let scrollOffset = scroller.scrollLeft;
    let scrollerLeftMargin = scroller.getBoundingClientRect().left;
    let temporaryArrowMargin = 121;
    let scrollerWidth = scroller.getBoundingClientRect().right - scrollerLeftMargin;
    let scrollerLeftmostPoint = scrollerLeftMargin;
    let nonVisibleMasteriesToLeft = masteries
      // "mastery's left edge is after (bigger px position [more to right] than) scroller's leftmost edge" * (NOT)
      .filter(m => !(m.getBoundingClientRect().left >= scrollerLeftmostPoint));
    this.scrolling_masteries_left_available = nonVisibleMasteriesToLeft.length > 0;
    console.log(nonVisibleMasteriesToLeft.length + " non-visible Masteries to the LEFT");
    if (nonVisibleMasteriesToLeft.length === 0) {
      // No scrollable content
      return;
    }
    // Get the rightmost non-visible mastery and how many pixels is it hidden => reverse to how many pixels OF IT are visible
    let firstToTheLeftBoundingClient = nonVisibleMasteriesToLeft[nonVisibleMasteriesToLeft.length-1].getBoundingClientRect();
    let howManyPixelsHidden = (firstToTheLeftBoundingClient.left * -1) + scrollerLeftMargin;
    // Width - hidden
    let visibleAmount = (firstToTheLeftBoundingClient.right - firstToTheLeftBoundingClient.left) - howManyPixelsHidden;
    let amountToReduce = scrollerWidth - visibleAmount;
    let toScrollLeft = scrollOffset - amountToReduce + temporaryArrowMargin;
    if (toScrollLeft < 0) {
      console.log("This would go below scrollLeft: 0, resetting to 0.");
      toScrollLeft = 0;
    }
    scroller.scrollLeft = toScrollLeft; // This'll trigger onMasteriesScrolled and so forth (ScrollingEnd after 1s)
  }

  private _processGamehistoryJsonResponse(api_res) {
    switch (api_res.type) {
      case ResType.SUCCESS:
        this.gamehistory = api_res.data.map(record => new GameReference(record, this.champions));
        this.autoload_these_games = this.gamehistory.slice(0,30).map(g => g.game_id);
        break;

      case ResType.ERROR:
        this.gamehistory_error_text_key = "internal_server_error";
        this.gamehistory_error_details = api_res.error;
        break;

      case ResType.NOT_FOUND:
        this.gamehistory_error_text_key = "gamehistory_not_found";
        break;

      case ResType.TRY_LATER:
        this.gamehistory_error_text_key = "try_again_in_a_minute";
        break;
    }
  }
  private _processMasterypointsJsonResponse(api_res) {
    switch (api_res.type) {
      case ResType.SUCCESS:
        this.masterypoints = api_res.data.map(m_json => new Championmastery(m_json, this.champions))
          .sort((a,b) => b.total_points - a.total_points);
        break;

      case ResType.ERROR:
        this.masterypoints_error_text_key = "internal_server_error";
        this.masterypoints_error_details = api_res.error;
        break;

      case ResType.NOT_FOUND:
        this.masterypoints_error_text_key = "gamehistory_not_found";
        break;

      case ResType.TRY_LATER:
        this.masterypoints_error_text_key = "try_again_in_a_minute";
        break;
    }
  }

  ngOnChanges(changes) {
    // If [summoner] changed
    if (changes['summoner'].currentValue != changes['summoner'].previousValue) {
      this.gamehistory = null;
      this.gamehistory_error_text_key = "";
      this.gamehistory_error_details = "";
      this.masterypoints = null;
      this.masterypoints_error_text_key = "";
      this.masterypoints_error_details = "";
      this.loading = true;

      if (this.ongoing_request) {
        this.ongoing_request.unsubscribe();
      }

      let region = this.summoner.region;
      let account_id = this.summoner.account_id;
      let summoner_id = this.summoner.id;
      this.ongoing_request = Observable.forkJoin([
        this.player_api.getListOfRankedGamesJson(region, account_id, GameType.SOLO_AND_FLEXQUEUE),
        this.player_api.getMasteryPointCountsJson(region, summoner_id)
      ])
        .subscribe(api_responses => {
          this._processGamehistoryJsonResponse(api_responses[0]);
          this._processMasterypointsJsonResponse(api_responses[1]);

          this.loading = false;
        });
    }
  }

  ngOnInit() {}

  ngAfterViewInit() {
    this.lazy_scroller_query.changes
      .subscribe((matching_queried_components: QueryList<ElementRef>) => {
        if (matching_queried_components.length > 0) {
          // Initialize new scroller here as it was successfully queried
          this.masteryscroller = matching_queried_components.first;
          let scroller = this.masteryscroller.nativeElement;
          let masteries = <Array<Element>>Array.from(scroller.children);

          // Check right
          let scrollerRightmostPoint = scroller.getBoundingClientRect().right;
          let nonVisibleMasteriesToRight = masteries
          // "mastery's right edge is before (smaller px position than) scroller's rightmost edge" * (NOT)
            .filter(m => !(m.getBoundingClientRect().right < scrollerRightmostPoint));
          this.scrolling_masteries_right_available = nonVisibleMasteriesToRight.length > 0;

          // Check left
          let scrollerLeftmostPoint = scroller.getBoundingClientRect().left;
          let nonVisibleMasteriesToLeft = masteries
          // "mastery's left edge is after (bigger px position [more to right] than) scroller's leftmost edge" * (NOT)
            .filter(m => !(m.getBoundingClientRect().left > scrollerLeftmostPoint));
          this.scrolling_masteries_left_available = nonVisibleMasteriesToLeft.length > 0;

          // WE UPDATED UI COMPONENT STATES RIGHT >AFTER CHANGE( DETECTION)<
          // => UPDATE STATE BY MANUALLY DETECTING ANY NEW CHANGES
          // ^p.i.t.a. to debug if gotten wrong in production mode... it alerts only in dev mode
          this.changeDetector.detectChanges();
        }
      });
  }

}