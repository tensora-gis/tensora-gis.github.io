import { useCallback, useState } from 'react';
import { CorridorAlignment, HydrologyReport, HydrologyRunFailure, ChainageRecord } from './types/hydrology';
import { createDefaultSampleCorridor } from './data/defaultSample';
import { delineateCatchment } from './utils/delineationEngine';
import {
  resolveCoordinateForTargetChainage,
  enrichChainagesWithElevation,
} from './utils/fileParsers';
import { findNearestPointOnPolyline, decimalToDMS } from './utils/geoUtils';
import { Header } from './components/Header';
import { AppUser } from './auth/useGoogleAuth';
import { InputPanel } from './components/InputPanel';
import { MapViewport } from './components/MapViewport';
import { ChainageRegisterModal } from './components/ChainageRegisterModal';
import { ActiveModuleTab } from './types/navigation';
import { LeftMenu } from './components/LeftMenu';
import { WaterDistributionModelling } from './components/WaterDistributionModelling';

/** Clicks within this distance of the centreline snap to the nearest station. */
const SNAP_TO_CORRIDOR_M = 50;

export default function App({
  user,
  onSignOut,
}: {
  user: AppUser;
  onSignOut: () => void;
}) {
  const [alignment, setAlignment] = useState<CorridorAlignment | null>(null);
  const [report, setReport] = useState<HydrologyReport | null>(null);
  const [failure, setFailure] = useState<HydrologyRunFailure | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveModuleTab>('stormwater');
  const [isLeftMenuOpen, setIsLeftMenuOpen] = useState<boolean>(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  /**
   * Resolves a chainage to an exact point on the corridor and delineates it.
   * Either a measured report or an explicit failure is produced - never a
   * report containing substituted numbers.
   */
  const runDelineation = useCallback(
    async (ch: number, target: CorridorAlignment) => {
      setIsLoading(true);
      try {
        const { lat, lng, bearing } = resolveCoordinateForTargetChainage(ch, target);
        const station = target.chainages.find((c) => Math.abs(c.chainage - ch) < 0.1);

        const outcome = await delineateCatchment({
          targetChainage: ch,
          lat,
          lng,
          corridorBearing: bearing,
          surveyElevation: station?.elevation,
          // The formation must be modelled, or the embankment hides the
          // drainage that actually arrives at the crossing.
          corridor: target.coordinates,
          corridorStartChainage: target.startChainage,
        });

        if (outcome.report) {
          setReport(outcome.report);
          setFailure(null);
        } else {
          setReport(null);
          setFailure(outcome.failure);
        }
        return outcome.report;
      } catch (err) {
        console.error('Delineation error:', err);
        setReport(null);
        setFailure({
          targetChainage: ch,
          targetChainageFormatted: String(ch),
          latitudeDD: 0,
          longitudeDD: 0,
          scopeAppliedM: 500,
          scopeExpandedDueToFlatRelief: false,
          demCoverage: 0,
          message: `Delineation could not be started: ${(err as Error)?.message ?? 'unknown error'}`,
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleSelectChainage = useCallback(
    (ch: number) => {
      const target = alignment ?? createDefaultSampleCorridor();
      return runDelineation(ch, target);
    },
    [alignment, runDelineation]
  );

  /**
   * Direct latitude/longitude entry. The point is projected onto the corridor
   * and the chainage it corresponds to is identified, so the analysis still
   * belongs to a station on the alignment.
   */
  const handleSelectCoordinates = useCallback(
    (lat: number, lng: number) => {
      const target = alignment;
      if (target && target.coordinates.length >= 2) {
        const snap = findNearestPointOnPolyline(lat, lng, target.coordinates, target.startChainage);
        return runDelineation(Math.round(snap.chainage * 1000) / 1000, target);
      }
      // No corridor to reference: analyse exactly where the user pointed.
      setIsLoading(true);
      void (async () => {
        try {
          const outcome = await delineateCatchment({
            targetChainage: 0,
            lat,
            lng,
            chainageLabel: 'MAP POINT',
          });
          if (outcome.report) {
            setReport(outcome.report);
            setFailure(null);
          } else {
            setReport(null);
            setFailure(outcome.failure);
          }
        } catch (err) {
          console.error('Free-point delineation error:', err);
        } finally {
          setIsLoading(false);
        }
      })();
      return Promise.resolve(null);
    },
    [alignment]
  );

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (alignment && alignment.coordinates.length >= 2) {
        const snap = findNearestPointOnPolyline(lat, lng, alignment.coordinates, alignment.startChainage);
        if (snap.distanceM <= SNAP_TO_CORRIDOR_M) {
          void handleSelectChainage(Math.round(snap.chainage));
          return;
        }
      }
      void handleSelectCoordinates(lat, lng);
    },
    [alignment, handleSelectChainage, handleSelectCoordinates]
  );

  const handleAlignmentUpdated = useCallback(
    async (newAlignment: CorridorAlignment) => {
      // Fill any station that arrived without a reduced level from the DEM, so
      // the chainage register is complete.
      const withElevations = await enrichChainagesWithElevation(newAlignment.chainages);
      const enriched: CorridorAlignment = { ...newAlignment, chainages: withElevations };

      setAlignment(enriched);
      if (withElevations.length > 0) {
        await runDelineation(withElevations[0].chainage, enriched);
      }
    },
    [runDelineation]
  );

  const handleChainagesUpdated = useCallback(
    async (records: ChainageRecord[], fileName?: string) => {
      let updatedAlign: CorridorAlignment;

      if (!alignment || alignment.coordinates.length < 2) {
        const hasRealCoords = records.some((r) => !r.chainageOnly);
        if (hasRealCoords) {
          // The uploaded sheet is itself the alignment.
          const startCh = records[0].chainage;
          const endCh = records[records.length - 1].chainage;
          updatedAlign = {
            name: fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Uploaded Chainage Project',
            filename: fileName || 'Chainages.xlsx',
            coordinates: records.map((r) => [r.lat, r.lng]),
            totalLengthM: Math.max(1, endCh - startCh),
            startChainage: startCh,
            endChainage: endCh,
            chainages: records,
          };
        } else {
          // Chainage-only sheet with no corridor: stations cannot be placed, so
          // load the reference geometry and let the stations resolve onto it.
          updatedAlign = {
            ...createDefaultSampleCorridor(),
            name: fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Uploaded Chainage Project',
            filename: fileName || 'Chainages.xlsx',
            chainages: [],
          };
        }
      } else {
        updatedAlign = { ...alignment, chainages: [] };

        // Re-anchor to the sheet's own chainage frame when it sits outside the
        // corridor's frame, otherwise every station clamps onto one endpoint.
        if (records.length > 1) {
          const sheetMin = records[0].chainage;
          const sheetMax = records[records.length - 1].chainage;
          if (sheetMin < alignment.startChainage - 1 || sheetMax > alignment.endChainage + 1) {
            updatedAlign.startChainage = sheetMin;
            updatedAlign.endChainage = sheetMax;
          }
        }
      }

      // Resolve coordinates for chainage-only rows along the active alignment.
      updatedAlign.chainages = records.map((r) => {
        if (!r.chainageOnly) return r;
        try {
          const { lat, lng } = resolveCoordinateForTargetChainage(r.chainage, updatedAlign);
          return {
            ...r,
            lat,
            lng,
            decLat: lat,
            decLng: lng,
            dmsLat: decimalToDMS(lat, true),
            dmsLng: decimalToDMS(lng, false),
            chainageOnly: false,
          };
        } catch {
          return r;
        }
      });

      updatedAlign.chainages = await enrichChainagesWithElevation(updatedAlign.chainages);

      if (updatedAlign.chainages.length > 0) {
        updatedAlign.startChainage = updatedAlign.chainages[0].chainage;
        updatedAlign.endChainage = updatedAlign.chainages[updatedAlign.chainages.length - 1].chainage;
      }

      setAlignment(updatedAlign);
      if (updatedAlign.chainages.length > 0) {
        await runDelineation(updatedAlign.chainages[0].chainage, updatedAlign);
      }
    },
    [alignment, runDelineation]
  );

  const handleClearData = useCallback(() => {
    setAlignment(null);
    setReport(null);
    setFailure(null);
  }, []);

  const handleLoadDemo = useCallback(async () => {
    const stations = await enrichChainagesWithElevation(createDefaultSampleCorridor().chainages);
    const enriched: CorridorAlignment = { ...createDefaultSampleCorridor(), chainages: stations };
    setAlignment(enriched);
    if (stations.length > 0) {
      await runDelineation(
        stations.find((c) => Math.abs(c.chainage - 69340) < 0.1)?.chainage ?? stations[0].chainage,
        enriched
      );
    }
  }, [runDelineation]);

  const handleUpdateReport = useCallback((updated: HydrologyReport) => {
    setReport(updated);
    setFailure(null);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0a0a] text-[#e5e7eb]">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onToggleMenu={() => {
          setIsLeftMenuOpen((prev) => !prev);
          setIsMobileMenuOpen((prev) => !prev);
        }}
        onClearData={handleClearData}
        activeChainage={report ? report.targetChainageFormatted : 'None'}
        totalChainages={alignment ? alignment.chainages.length : 0}
        corridorName={alignment ? alignment.name : 'Ready for Upload'}
        onOpenRegister={() => setIsRegisterOpen(true)}
        hasData={!!alignment}
        user={user}
        onSignOut={onSignOut}
      />

      <div className="flex-1 flex h-[calc(100vh-56px)] overflow-hidden relative">
        {/* Left Corner Menu */}
        <LeftMenu
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isOpen={isLeftMenuOpen}
          onToggleOpen={() => setIsLeftMenuOpen((prev) => !prev)}
          isMobileDrawerOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          stormwaterStationCount={alignment ? alignment.chainages.length : 0}
          hasStormwaterData={!!alignment}
        />

        {/* Stormwater Modelling Workspace (everything moved under Stormwater modelling) */}
        <main
          className={`flex-1 flex flex-col md:flex-row h-full overflow-hidden relative ${
            activeTab === 'stormwater' ? 'flex' : 'hidden'
          }`}
        >
          <InputPanel
            report={report}
            failure={failure}
            alignment={alignment}
            onSelectChainage={(ch) => void handleSelectChainage(ch)}
            onSelectCoordinates={(lat, lng) => void handleSelectCoordinates(lat, lng)}
            onAlignmentUpdated={(a) => void handleAlignmentUpdated(a)}
            onChainagesUpdated={(r, f) => void handleChainagesUpdated(r, f)}
            isLoading={isLoading}
            onOpenRegister={() => setIsRegisterOpen(true)}
            onClearData={handleClearData}
            onLoadDemo={() => void handleLoadDemo()}
            onUpdateReport={handleUpdateReport}
          />

          <div className="flex-1 h-full min-h-[350px] relative">
            <MapViewport
              report={report}
              alignment={alignment}
              onMapClickCoordinate={handleMapClick}
            />
          </div>
        </main>

        {/* Water Distribution Modelling Workspace (empty for now) */}
        {activeTab === 'water-distribution' && (
          <WaterDistributionModelling />
        )}
      </div>

      {alignment && (
        <ChainageRegisterModal
          isOpen={isRegisterOpen}
          onClose={() => setIsRegisterOpen(false)}
          chainages={alignment.chainages}
          activeChainage={report ? report.targetChainage : (alignment.chainages[0]?.chainage ?? 0)}
          onSelectChainage={(ch) => void handleSelectChainage(ch)}
          corridorName={alignment.name}
        />
      )}

    </div>
  );
}
