import { lazy } from 'react';
import { WindowLoader } from './components/WindowLoader';

const Editor = lazy(() => import('./components/editor/Editor').then(m => ({ default: m.Editor })));
const MarkdownEditorWindow = lazy(() => import('./components/markdown/MarkdownEditorWindow').then(m => ({ default: m.MarkdownEditorWindow })));
const PieceEditorWindow = lazy(() => import('./components/pieceEditor/PieceEditorWindow').then(m => ({ default: m.PieceEditorWindow })));
const PublishingWindow = lazy(() => import('./components/publishing/PublishingWindow').then(m => ({ default: m.PublishingWindow })));
const ContentEditorWindow = lazy(() => import('./components/content/ContentEditorWindow').then(m => ({ default: m.ContentEditorWindow })));
const ThemeEditorWindow = lazy(() => import('./components/themes/ThemeEditorWindow').then(m => ({ default: m.ThemeEditorWindow })));
const RoomThemeEditorWindow = lazy(() => import('./components/themes/RoomThemeEditorWindow').then(m => ({ default: m.RoomThemeEditorWindow })));

const FactionEditorWindow=lazy(()=>import('./components/factions/FactionEditorWindow').then(m=>({default:m.FactionEditorWindow})));

function App() {
  const params = new URLSearchParams(window.location.search);
  if(params.get('factionEditor')==='1')return <WindowLoader name="Faction管理"><FactionEditorWindow /></WindowLoader>;
  if (params.get('publishing') === '1') return <WindowLoader name="出版画面"><PublishingWindow /></WindowLoader>;
  if (params.get('pieceEditor') === '1') return <WindowLoader name="ピースエディタ"><PieceEditorWindow /></WindowLoader>;
  if (params.get('markdownEditor') === '1') return <WindowLoader name="Markdownエディタ"><MarkdownEditorWindow /></WindowLoader>;
  if (params.get('contentEditor') === '1') return <WindowLoader name="コンテンツライブラリ"><ContentEditorWindow /></WindowLoader>;
  if (params.get('themeEditor') === '1') return <WindowLoader name="テーマ管理"><ThemeEditorWindow /></WindowLoader>;
  if (params.get('roomThemeEditor') === '1') return <WindowLoader name="Room Theme管理"><RoomThemeEditorWindow /></WindowLoader>;
  return <WindowLoader name="ダンジョンエディタ"><Editor /></WindowLoader>;
}

export default App;
